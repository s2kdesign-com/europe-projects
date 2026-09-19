import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DailyNotificationTime from '../app/components/DailyNotificationTime.jsx';
import ProjectActions from '../app/components/ProjectActions.jsx';
import labels from '../app/lib/i18n/premium-labels.json';
import { LOCALE_CODES } from '../app/lib/i18n/locales.js';

const language=vi.hoisted(()=>({value:'bg'}));
vi.mock('../app/lib/i18n/ui-translate.js',()=>({useUiTranslate:()=>text=>labels[text]?.[language.value]||text}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
test.each(LOCALE_CODES)('all new labels are available offline in %s',lang=>{
  for(const translations of Object.values(labels))expect(translations[lang]?.trim()).toBeTruthy();
});
test.each(['bg','en','de','fr','es'])('hour control has a localized label, local timezone and numeric value in %s',lang=>{
  language.value=lang;const change=vi.fn();
  render(<DailyNotificationTime country="DE" value={undefined} onChange={change}/>);
  const select=screen.getByLabelText(labels['Час за дневните известия'][lang]);
  expect(select).toHaveValue('10');expect(screen.getAllByRole('option')).toHaveLength(24);
  expect(screen.getByText(/Europe\/Berlin/)).toBeInTheDocument();
  fireEvent.change(select,{target:{value:'0'}});expect(change).toHaveBeenCalledWith(0);
});
test('shared Save and Compare actions retain independent callbacks, states and canonical links',()=>{
  const save=vi.fn(),compare=vi.fn(),open=vi.fn(),p={id:'fixture',public_slug:'canonical-fixture',doc_count:1};
  render(<ProjectActions p={p} isSaved inCompare={false} onOpen={open} onToggleSave={save} onToggleCompare={compare}/>);
  const saved=screen.getByRole('button',{name:'card.removeSaved'}),compared=screen.getByRole('button',{name:'card.addCompare'});
  expect(saved.parentElement).toBe(compared.parentElement);expect(saved).toHaveAttribute('aria-pressed','true');
  fireEvent.click(saved);fireEvent.click(compared);expect(save).toHaveBeenCalledWith(p);expect(compare).toHaveBeenCalledWith(p.id);
  expect(screen.getByRole('link')).toHaveAttribute('href','/procedures/canonical-fixture');
});
