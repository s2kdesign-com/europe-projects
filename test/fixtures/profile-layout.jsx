// Local visual fixture: actual production components/CSS, synthetic public data
// and billing responses. No production credentials, checkout or notifications.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import PremiumPanel from '../../app/components/PremiumPanel.jsx';
import DailyNotificationTime from '../../app/components/DailyNotificationTime.jsx';
import ProjectCard from '../../app/components/ProjectCard.jsx';
import ProjectDrawer from '../../app/components/ProjectDrawer.jsx';
import cardLocales from './card-locales.json';
import '../../app/globals.css';
import '../../app/overview.css';
import {setUiLocale} from '../../app/lib/project-utils.js';
import '../../app/auth.css';
import '../../app/site.css';
import '../../app/i18n.css';

const params=new URLSearchParams(location.search),lang=params.get('lang')||'bg';
i18n.use(initReactI18next).init({lng:lang,fallbackLng:'bg',keySeparator:false,
  resources:Object.fromEntries(Object.entries(cardLocales).map(([language,translation])=>[language,{translation}])),
  interpolation:{escapeValue:false},react:{useSuspense:false}});
setUiLocale(lang);
const premium=params.has('premium');
window.fetch=async path=>new Response(JSON.stringify(String(path).endsWith('/plans')?
  {ok:true,configured:true,plans:[{id:'monthly',display_name:'Premium',billing_interval:'month',amount:725,currency:'eur'},
    {id:'annual',display_name:'Premium',billing_interval:'year',amount:7100,currency:'eur'}]}:
  String(path).endsWith('/reports')?{ok:true,reports:[]}:
  {ok:true,entitlement:{premium,source:premium?'administrator':null},canManage:premium}),{headers:{'content-type':'application/json'}});
const phrases={bg:'Финансиране за иновативни организации и устойчиво регионално развитие',en:'Funding for innovative organisations and sustainable regional development',de:'Förderung innovativer Unternehmen und nachhaltiger Regionalentwicklung',fr:'Financement des organisations innovantes et du développement régional durable',es:'Financiación de organizaciones innovadoras y desarrollo regional sostenible'};
const long=phrases[lang]||cardLocales[lang]['card.candidatesLabel'].repeat(8);
const project={id:'visual-fixture',public_slug:'visual-fixture',name:long+' '+long,program:long+' '+('EU-FUNDING'.repeat(10)),
  status:'open',deadline_date:'2099-10-01',budget:long+' 1 234 567 EUR',eligible:long,doc_count:1,link:'https://example.invalid/funding',last_updated:'2026-09-20'};
const loadDetail=async()=>({project,documents:[{id:'doc-fixture',title:long,doc_type:'application',source_url:'https://example.invalid/application',content:long}]});
function Fixture(){
  const [saved,setSaved]=useState(false),[compared,setCompared]=useState(false),[opened,setOpened]=useState(false),[hour,setHour]=useState(10);
  return <main style={{maxWidth:1200,margin:'24px auto',padding:16}}>
    <div style={{maxWidth:900,margin:'0 auto'}}><PremiumPanel userId="visual-fixture"/>
      <section className="prof-card"><DailyNotificationTime value={hour} country="DE" onChange={setHour}/></section></div>
    <div className="cards">{[0,1,2].map(i=><ProjectCard key={i} p={{...project,id:project.id+i}} now={new Date('2026-09-20')}
      isSaved={saved} inCompare={compared} onOpen={()=>setOpened(true)} onToggleSave={()=>setSaved(v=>!v)}
      onToggleCompare={()=>setCompared(v=>!v)} onCopyLink={()=>{}}/>)}</div>
    {opened&&<ProjectDrawer base={project} loadDetail={loadDetail} onClose={()=>setOpened(false)} isSaved={saved}
      onToggleSave={()=>setSaved(v=>!v)} onCopyLink={()=>{}} onCalendar={()=>{}}/>}
  </main>;
}
createRoot(document.getElementById('root')).render(<I18nextProvider i18n={i18n}><Fixture/></I18nextProvider>);
