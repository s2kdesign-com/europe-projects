"""Require reviewed field translations, retaining the exact D1 source for audit."""
from collections import Counter
import json
import re

FIELDS = ('title', 'budget', 'applicants')


def facts(text):
    # Keep numeric spelling (including separators), currencies and URLs intact.
    return Counter(re.findall(r'https?://[^\s]+|\d+(?:[.,]\d+)*|\b(?:EUR|BGN|USD|PLN|RON|CZK|HUF|SEK|DKK)\b|[€$£%]', text))


def localized_fields(procedure, language):
    review = procedure.get('localization') or {}
    source = {key: procedure.get(key) for key in FIELDS}
    if review.get('language') != language or review.get('source') != source:
        raise ValueError('Field language review missing or stale; translate the live snapshot before composing')
    fields = review.get('fields') or {}
    for key, original in source.items():
        translated = fields.get(key)
        if original in (None, ''):
            if translated not in (None, ''):
                raise ValueError('Translation invented a missing field: '+key)
            continue
        if not isinstance(translated, str) or not translated.strip():
            raise ValueError('Translation missing: '+key)
        if facts(str(original)) != facts(translated):
            raise ValueError('Translation changed numbers, currencies or URLs: '+key)
        # Project original_language is not reliable for individual narrative fields.
        # Latin proper names may occur in every locale; Bulgarian/Greek prose in
        # other locales needs translation or explicit editorial resolution.
        if language != 'bg' and re.search(r'[\u0400-\u04ff]', translated):
            raise ValueError('Untranslated Cyrillic text in '+key)
        if language != 'el' and re.search(r'[\u0370-\u03ff\u1f00-\u1fff]', translated):
            raise ValueError('Untranslated Greek text in '+key)
    return fields


def validate_saved_draft(row):
    """A legacy or modified draft cannot reach a publishing claim unchecked."""
    from compose import LOCALES, procedure_line
    saved = json.loads(row['changes_json'])['content']
    if saved.get('language') != row['language'] or saved.get('localization_version') != 1:
        raise ValueError('Saved draft needs a field language review before publishing')
    for platform, limit in (('facebook', 1000), ('linkedin', 1300)):
        text = row[platform+'_text']
        if text != saved[platform] or len(text) > limit:
            raise ValueError('Saved draft text differs from reviewed content or exceeds its limit')
        for procedure in saved['used']:
            line = procedure_line(procedure, LOCALES[row['language']], row['language'])
            if line not in text:
                raise ValueError('Saved draft omits a reviewed procedure')
