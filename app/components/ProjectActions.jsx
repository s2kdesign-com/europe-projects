"use client";
import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { procedurePath } from '../lib/public-url.js';

// Shared by grid, attention and recommendation cards. Keep personal actions
// together while translated labels wrap inside their own equal-width controls.
export default function ProjectActions({p,isSaved,inCompare,onOpen,onToggleSave,onToggleCompare,onCopyLink,compact}) {
  const {t}=useTranslation(),docCount=p.doc_count||0;
  return <div className="card-actions">
    <div className="card-primary-actions">
      <a className="details" href={procedurePath(p)} aria-haspopup="dialog" onClick={e=>{
        if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button===0){e.preventDefault();onOpen(p.id,'overview');}
      }}><Icon name="arrowRight" size={16}/><span>{t('card.details')}</span></a>
      <button className="details" onClick={()=>onOpen(p.id,'documents')} disabled={!docCount}
        title={!docCount?t('card.noDocuments'):undefined} aria-haspopup="dialog">
        <Icon name="document" size={16}/><span>{t('card.documents')} ({docCount})</span>
      </button>
      {!compact&&onCopyLink&&<button className="iconbtn" aria-label={t('card.copyLink')} title={t('card.copyLink')} onClick={()=>onCopyLink(p)}><Icon name="link" size={18}/></button>}
    </div>
    <div className="card-personal-actions">
      <button className={'details'+(isSaved?' saved':'')} aria-pressed={!!isSaved}
        aria-label={isSaved?t('card.removeSaved'):t('card.saveProcedure')} onClick={()=>onToggleSave(p)}>
        <Icon name={isSaved?'bookmarkFilled':'bookmark'} size={18}/><span>{t('card.save')}</span>
      </button>
      <button className="details" aria-pressed={!!inCompare} aria-label={inCompare?t('card.removeCompare'):t('card.addCompare')} onClick={()=>onToggleCompare(p.id)}>
        <Icon name="compare" size={18}/><span>{t('card.compare')}</span>
      </button>
    </div>
  </div>;
}
