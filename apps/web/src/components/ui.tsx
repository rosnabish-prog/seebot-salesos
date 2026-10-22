'use client';
import { Children, isValidElement, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleX, X, Check, AlertCircle, Plus, LoaderCircle, ChevronRight, CheckCircle2, SearchX, ClipboardList, FolderOpen, ChevronDown } from 'lucide-react';
export function Panel({children,className='',title,actions}:{children:ReactNode;className?:string;title?:string;actions?:ReactNode}){return <section className={`panel ${className}`}><div className="panel-title-row">{title&&<h2>{title}</h2>}{actions}</div>{children}</section>}
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'orange'|'green'|'red'|'blue'}){return <span className={`badge badge-${tone}`}>{children}</span>}
export function Button({children,variant='primary',loading=false,...props}:{children:ReactNode;variant?:'primary'|'secondary'|'ghost'|'danger';loading?:boolean} & React.ButtonHTMLAttributes<HTMLButtonElement>){return <button {...props} disabled={props.disabled||loading} className={`btn btn-${variant} ${props.className||''}`}>{loading?<LoaderCircle size={15} className="spin"/>:null}{children}</button>}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span className="field-label">{label}</span>{children}{hint&&<small className="muted">{hint}</small>}</label>}
/** Renders in document.body so route animations and sidebar layouts cannot move the dialog. */
export function Modal({title,children,onClose,width=520}:{title:string;children:ReactNode;onClose:()=>void;width?:number}){
 const [mounted,setMounted]=useState(false);
 const titleId=useId();
 const ref=useRef<HTMLDivElement>(null);
 const closeRef=useRef(onClose);
 closeRef.current=onClose;
 useEffect(()=>{
   setMounted(true);
   const previousFocus=document.activeElement as HTMLElement|null;
   const oldOverflow=document.body.style.overflow;
   document.body.style.overflow='hidden';
   const focusHandle=window.requestAnimationFrame(()=>{
     (ref.current?.querySelector('input:not([type="hidden"]), textarea, select') as HTMLElement|null)?.focus();
   });
   const keydown=(e:KeyboardEvent)=>{
     if(e.key==='Escape'){e.preventDefault();closeRef.current();return;}
     if(e.key!=='Tab'||!ref.current)return;
     const focusable=[...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length>0);
     if(!focusable.length)return;
     const first=focusable[0],last=focusable[focusable.length-1];
     if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
     else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   };
   document.addEventListener('keydown',keydown);
   return()=>{document.removeEventListener('keydown',keydown);window.cancelAnimationFrame(focusHandle);document.body.style.overflow=oldOverflow;previousFocus?.focus();};
 },[]);
 if(!mounted)return null;
 return createPortal(<div className="modal-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeRef.current();}}><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{maxWidth:width}}><div className="modal-top"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={()=>closeRef.current()} aria-label="Close dialog"><X size={20}/></button></div>{children}</div></div>,document.body);
}
/** Consistent dropdown used in filters and sales forms, independent of native OS menu styling. */
function selectLabel(node:ReactNode):string{if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(selectLabel).join('');if(isValidElement(node))return selectLabel((node.props as {children?:ReactNode}).children);return '';}
export function BrandSelect({children,value,onValueChange,className='',required=false,ariaLabel}:{children:ReactNode;value:string|number;onValueChange:(value:string)=>void;className?:string;required?:boolean;ariaLabel?:string}){
 const [open,setOpen]=useState(false);
 const ref=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const listId=useId();
 const options=Children.toArray(children).filter(isValidElement).map(child=>{
   const props=child.props as {value?:string|number;children?:ReactNode;disabled?:boolean};
   const label=selectLabel(props.children).trim()||String(props.value??'');
   return {value:String(props.value??label),label,disabled:props.disabled===true};
 });
 const selected=options.find(o=>o.value===String(value));
 useEffect(()=>{
   if(!open)return;
   const closeOnOutside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
   const closeOnEscape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
   document.addEventListener('pointerdown',closeOnOutside);
   document.addEventListener('keydown',closeOnEscape);
   return()=>{document.removeEventListener('pointerdown',closeOnOutside);document.removeEventListener('keydown',closeOnEscape);};
 },[open]);
 const choose=(v:string)=>{onValueChange(v);setOpen(false);trigger.current?.focus();};
 return <div className={`brand-select ${className.split(/\s+/).filter(token=>token!=='select').join(' ')}`} ref={ref}>
   <button ref={trigger} type="button" className="brand-select-trigger" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" aria-controls={listId} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{
     if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);}
     if(e.key==='Enter'&&open){e.preventDefault();setOpen(false);}
   }}><span className={!String(value)?'brand-select-placeholder':''}>{selected?.label||'Select an option'}</span><ChevronDown size={17} aria-hidden="true" className={open?'select-chevron-open':''}/></button>
   {required&&<input className="brand-select-required" tabIndex={-1} aria-hidden="true" required value={String(value)} onChange={()=>{}} onInvalid={e=>{e.preventDefault();setOpen(true);trigger.current?.focus();}}/>}
   {open&&<div className="brand-select-menu" id={listId} role="listbox" aria-label={ariaLabel||'Select option'} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const index=items.indexOf(document.activeElement as HTMLButtonElement);items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}else if(e.key==='Home'||e.key==='End'){e.preventDefault();const items=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));(e.key==='Home'?items[0]:items[items.length-1])?.focus();}}}>{options.map((o,i)=><button key={`${o.value}-${i}`} type="button" role="option" aria-selected={o.value===String(value)} disabled={o.disabled} onClick={()=>choose(o.value)}>{o.label}{o.value===String(value)&&<Check size={15} aria-hidden="true"/>}</button>)}</div>}
 </div>;
}
export function ErrorMessage({message}:{message:string}){return message?<div className="error-banner"><AlertCircle size={17}/>{message}</div>:null}
export function Empty({title,description,action,icon}:{title:string;description:string;action?:ReactNode;icon?:'complete'|'search'|'tasks'|'folder'}){const Icon=icon==='complete'||/caught up|no stalled/i.test(title)?CheckCircle2:icon==='search'||/no prospect/i.test(title)?SearchX:icon==='tasks'||/nothing due/i.test(title)?ClipboardList:FolderOpen;return <div className="empty"><div className="empty-emblem"><Icon size={26}/></div><strong>{title}</strong><p>{description}</p>{action}</div>}
export function PageTop({kicker,title,description,action}:{kicker?:string;title:string;description?:string;action?:ReactNode}){return <div className="page-top"><div><span className="eyebrow">{kicker||'SEEBOT SALESOS'}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>}
export function SuccessMessage({text}:{text:string}){return text?<div className="success-banner"><Check size={17}/>{text}</div>:null}
