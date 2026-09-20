"""Country artwork plus deterministic, Unicode-safe Euro-Funding typography."""
import argparse
import base64
from io import BytesIO
import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from common import ROOT, HTTPFailure, json_request
from compose import COUNTRIES

WIDTH, HEIGHT = 1536, 1024


def font(size, bold=False):
    return ImageFont.truetype(str(ROOT / 'fonts' / ('NotoSans-Bold.ttf' if bold else 'NotoSans-Regular.ttf')), size)


def wrap(draw, text, face, width):
    lines = []
    for paragraph in str(text).splitlines():
        line = ''
        for word in paragraph.split():
            attempt = (line + ' ' + word).strip()
            if draw.textlength(attempt, font=face) <= width:
                line = attempt
            else:
                if line:
                    lines.append(line)
                line = word
        if line:
            lines.append(line)
    return lines


def fit(draw, text, width, max_lines, high=66, low=40, bold=True):
    for size in range(high, low-1, -1):
        face = font(size, bold)
        lines = wrap(draw, text, face, width)
        if len(lines) <= max_lines and all(draw.textlength(line,font=face) <= width for line in lines):
            return face, lines
    raise ValueError('Overlay text does not fit; provide a shorter headline without changing facts')


def gradient(variant):
    image = Image.new('RGB', (WIDTH,HEIGHT))
    draw = ImageDraw.Draw(image)
    for x in range(WIDTH):
        t = x/WIDTH
        draw.line((x,0,x,HEIGHT), fill=(int(5+6*t),int(21+89*t),int(49+114*t)))
    # Decorative data paths, never a purported country photograph.
    for n in range(7):
        points = [(x, int(470+n*58+90*math.sin(x/290+variant+n*.2))) for x in range(630,WIDTH,4)]
        draw.line(points, fill=(21,110+n*9,165+n*6), width=3)
    for n in range(12):
        angle = n*math.tau/12
        cx,cy=1190+190*math.cos(angle),320+190*math.sin(angle)
        points=[]
        for k in range(10):
            a=k*math.pi/5-math.pi/2
            r=12 if k%2==0 else 5
            points.append((cx+r*math.cos(a),cy+r*math.sin(a)))
        draw.polygon(points, fill='#e8bf58')
    return image


def background(country, variant, no_ai):
    if no_ai or not os.environ.get('OPENAI_API_KEY'):
        return gradient(variant), 'gradient'
    prompt = (
        f"Premium photoreal-with-illustration European funding editorial artwork: {country['name_en']}; "
        f"{country['scenes'][variant]}, with subtle offices, farms, labs, solar or port details appropriate to this scene. "
        "Deep blue #0b6ea3 to navy, golden EU-star accents and flowing data-light lines. "
        "Country-recognisable generic landscape and architecture. Subject in the right two thirds; "
        "calm dark blue negative space on the left third for later typography. "
        "NO text, letters, numerals, logos, national flags, faces, documents or flowers. Landscape 1536x1024."
    )
    primary = os.environ.get('OPENAI_IMAGE_MODEL','gpt-image-1.5')
    models = [primary] + (['gpt-image-1'] if primary != 'gpt-image-1' else [])
    for i,model in enumerate(models):
        try:
            data,_ = json_request('POST','https://api.openai.com/v1/images/generations',
                headers={'Authorization':'Bearer '+os.environ['OPENAI_API_KEY']}, timeout=180,
                data={'model':model,'prompt':prompt,'size':'1536x1024','quality':'high','output_format':'png','n':1})
            image = Image.open(BytesIO(base64.b64decode(data['data'][0]['b64_json'], validate=True))).convert('RGB')
            if image.size != (WIDTH,HEIGHT):
                raise ValueError('Unexpected image size')
            return image, 'openai'
        except HTTPFailure as exc:
            # Only a model availability/unsupported-model error warrants changing model.
            if i == 0 and exc.status in (400,403,404) and 'model' in str(exc).lower():
                continue
            break
        except Exception:
            break
    return gradient(variant), 'gradient'


def make_image(out, country, lang, title, subtitle, cta, variant=0, no_ai=False):
    if variant not in (0,1,2):
        raise ValueError('Scene must be 0, 1 or 2')
    if lang not in {country['language'], country.get('alternate',{}).get('language')}:
        raise ValueError('Posting language does not match country')
    image, source = background(country, variant, no_ai)
    image=image.convert('RGBA')
    overlay=Image.new('RGBA',image.size)
    shade=ImageDraw.Draw(overlay)
    for x in range(WIDTH):
        opacity=int(224*max(0,1-x/1400))
        shade.line((x,0,x,HEIGHT), fill=(3,17,40,opacity))
    image=Image.alpha_composite(image,overlay).convert('RGB')
    draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((76,66,156,146),radius=19,fill='#0b6ea3')
    draw.text((116,104),'€',font=font(58,True),fill='white',anchor='mm')
    draw.text((178,83),'EURO-FUNDS.EU',font=font(39,True),fill='white')
    label=country['name_native']
    label_width=draw.textlength(label,font=font(26,True))
    draw.rounded_rectangle((78,205,116+label_width,261),radius=14,fill='#0b6ea3')
    draw.text((97,214),label,font=font(26,True),fill='white')
    face,lines=fit(draw,title,870,3)
    y=322
    for line in lines:
        draw.text((76,y),line,font=face,fill='white',stroke_width=0)
        y+=face.size+17
    subtitle_face,subtitle_lines=fit(draw,subtitle,970,2,high=30,low=22,bold=False)
    y=max(610,y+34)
    for line in subtitle_lines:
        draw.text((79,y),line,font=subtitle_face,fill='#c8e4ef')
        y+=subtitle_face.size+10
    cta_face,cta_lines=fit(draw,cta,1315,1,high=29,low=20,bold=True)
    pill_width=draw.textlength(cta_lines[0],font=cta_face)+62
    draw.rounded_rectangle((77,795,77+pill_width,878),radius=40,fill='#edc75e')
    draw.text((108,813),cta_lines[0],font=cta_face,fill='#071b36')
    draw.line((77,922,1459,922),fill='#38607c',width=2)
    footer=f"EURO-FUNDING · {country['name_native'].upper()} · EU FUNDING CALLS"
    footer_face,_=fit(draw,footer,1340,1,high=22,low=16,bold=False)
    draw.text((78,947),footer,font=footer_face,fill='#bdd0df')
    path=Path(out)
    path.parent.mkdir(parents=True,exist_ok=True)
    image.save(path,format='PNG',optimize=True)
    return {'out':str(path.resolve()),'bytes':path.stat().st_size,'source':source,'scene':variant}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('out','country','lang','title','subtitle','cta'):
        p.add_argument('--'+arg,required=True)
    p.add_argument('--variant',type=int,choices=range(3),default=0)
    p.add_argument('--no-ai',action='store_true')
    args=vars(p.parse_args())
    args['country']=next(c for c in COUNTRIES if c['code']==args['country'])
    if args['lang']=='nl' and args['country']['code']=='BE':
        args['country']={**args['country'],**args['country']['alternate']}
    print(json.dumps(make_image(**args),ensure_ascii=False))


if __name__=='__main__':
    main()
