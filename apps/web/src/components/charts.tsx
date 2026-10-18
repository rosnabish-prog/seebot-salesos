'use client';
import {ReactNode,useState} from 'react';
import {Info} from 'lucide-react';

export const METRIC_DEFINITIONS:Record<string,string>={
  'Active Opportunities':'Open opportunities currently assigned to the relevant team. This counts records, not expected revenue.',
  'Deals Won':'Opportunities marked Closed Won within the selected period. A won deal does not necessarily mean an invoice has been paid.',
  'Win Rate':'Closed Won opportunities divided by all Won plus Closed Lost opportunities decided in the selected period.',
  'New Prospects':'New prospect company accounts created within the selected period.',
  'Overdue Follow-ups':'Uncompleted assigned tasks with deadlines earlier than the current time.',
  'Stalled Opportunities':'Open opportunities that have remained in the same pipeline stage for more than 14 days.',
  'Open Proposals':'Currently open pilot proposals in the sales pipeline.',
  'New opportunities created':'Count of new opportunity records created on each UTC date, not total clients.',
  'Deals won':'Opportunities reaching Closed Won on each UTC date.'
};
/** Smooth Catmull–Rom to cubic Bézier interpolation. No angular point-to-point timeline. */
export function bezierPath(points:{x:number;y:number}[]):string{
  if(!points.length)return '';
  if(points.length===1)return `M ${points[0].x} ${points[0].y}`;
  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=0;i<points.length-1;i++){
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
    const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6;
    const c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;
    d+=` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x} ${p2.y}`;
  }
  return d;
}
export function SplineChart({data,valueKey,labelKey='date',title,height=210,color='#FF7A3D',compact=false,description}:{data:Record<string,any>[];valueKey:string;labelKey?:string;title:string;height?:number;color?:string;compact?:boolean;description?:string}){
 const [hovered,setHovered]=useState<number|null>(null);
 const values=data.map(d=>Number(d[valueKey])||0);
 if(values.length<2||values.every(v=>v===0))return <div className={`chart-empty ${compact?'chart-empty-compact':''}`}>{compact?'': 'No recorded activity for this period yet.'}</div>;
 const W=640,H=height,left=compact?0:40,right=compact?0:15,top=compact?10:22,bottom=compact?7:30;
 const min=Math.min(0,...values),max=Math.max(1,...values);const spread=max-min||1;
 const pts=values.map((v,i)=>({x:left+i*(W-left-right)/(values.length-1),y:top+(max-v)*(H-top-bottom)/spread}));
 const line=bezierPath(pts);const base=H-bottom;
 const area=`${line} L ${pts[pts.length-1].x} ${base} L ${pts[0].x} ${base} Z`;
 const latest=values[values.length-1];
 return <div className={`spline-chart ${compact?'compact':''}`}><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${values.length} observations, latest ${latest}, range ${min}–${max}.`} preserveAspectRatio="none">
   {!compact&&[0,1,2,3].map(i=><g key={i}><line x1={left} y1={top+i*(H-top-bottom)/3} x2={W-right} y2={top+i*(H-top-bottom)/3} stroke="#EDF0F1" strokeWidth={1}/><text x={left-9} y={top+i*(H-top-bottom)/3+3} fill="#868C96" fontSize="12" textAnchor="end">{Math.round(max-i*spread/3)}</text></g>)}
   <path d={area} fill={color} opacity="0.09" className="chart-area-reveal"/><path d={line} pathLength={1} className="chart-line-reveal" stroke={color} strokeWidth={compact?3:3.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
   {!compact&&[0,Math.floor((data.length-1)/2),data.length-1].map(i=><text key={i} x={pts[i].x} y={H-6} fill="#7C8491" fontSize="12" textAnchor={i===0?'start':i===data.length-1?'end':'middle'}>{String(data[i]?.[labelKey]||'').slice(5)}</text>)}
   {!compact&&pts.map((pt,i)=><circle key={i} cx={pt.x} cy={pt.y} r={hovered===i?7:5} fill={hovered===i?color:'transparent'} stroke={hovered===i?'white':'transparent'} strokeWidth={2} tabIndex={0} role="graphics-symbol" aria-label={`${String(data[i]?.[labelKey]||`Period ${i+1}`)}: ${values[i]} ${title}`} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)}><title>{String(data[i]?.[labelKey]||'')}: {values[i]} {title}</title></circle>)}
   <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r={compact?3.5:5} fill={color} stroke="white" strokeWidth="2"/>
  </svg>{!compact&&hovered!==null&&<div className="chart-hover-note" role="status"><strong>{String(data[hovered]?.[labelKey]||`Period ${hovered+1}`)}</strong> · {title}: <strong>{values[hovered].toLocaleString()}</strong><small>{` ${hovered+1} of ${data.length} periods`} · {description||METRIC_DEFINITIONS[title]||'Count of recorded items during this period.'}</small></div>}{!compact&&<div className="chart-foot"><span><i className="legend-dot"/>{title}</span><span>Latest: <strong>{latest}</strong></span></div>}</div>
}
export function MetricCard({label,value,icon,sub,trend,data,trendKey='active'}:{label:string;value:ReactNode;icon:ReactNode;sub?:string;trend?:string;data?:Record<string,any>[];trendKey?:string}){return <div className="metric-card"><div className="metric-top"><div className="metric-symbol">{icon}</div>{trend&&<span className="metric-trend">{trend}</span>}</div><span className="metric-label">{label} {METRIC_DEFINITIONS[label]&&<span tabIndex={0} title={METRIC_DEFINITIONS[label]} aria-label={`${label}: ${METRIC_DEFINITIONS[label]}`} className="metric-info"><Info size={13}/></span>}</span><div className="metric-number">{value}</div><div className="metric-bottom"><span>{sub||'Selected period'}</span>{data&&data.length>1&&<div className="mini-spark"><SplineChart data={data} valueKey={trendKey} title={label} compact height={48}/></div>}</div></div>}
export function Bars({data,labels,values,maxItems=9}:{data:Record<string,any>[];labels:string;values:string;maxItems?:number}){const sorted=[...data].sort((a,b)=>Number(b[values])-Number(a[values])).slice(0,maxItems);const max=Math.max(1,...sorted.map(d=>Number(d[values])||0));return <div className="bar-list">{sorted.length?sorted.map((d,i)=><div className="bar-row" key={String(d[labels])+i} title={`${String(d[labels]).replaceAll('_',' ')} — ${Number(d[values]).toLocaleString()} records`}><div className="bar-row-top"><span title={String(d[labels])}>{String(d[labels]).replaceAll('_',' ').toLowerCase()}</span><strong>{Number(d[values])}</strong></div><div className="bar-track"><div className="bar-fill" style={{width:`${(Number(d[values])/max)*100}%`}}/></div></div>):<div className="chart-empty">No records to visualize for this period.</div>}</div>}
