import { Search,ContactRound,Send,MessageCircleHeart,ClipboardList,FlaskConical,FileCheck2,FileSignature,PackageCheck,Handshake,Trophy,HelpCircle } from 'lucide-react';
import type { StageId } from '@seebot/shared';
const icons={
  ACCOUNT_RESEARCHED:Search,
  DECISION_MAKER_IDENTIFIED:ContactRound,
  OUTREACH_INITIATED:Send,
  INTEREST_ESTABLISHED:MessageCircleHeart,
  DISCOVERY_COMPLETED:ClipboardList,
  PILOT_QUALIFIED:FlaskConical,
  PILOT_PROPOSED:FileCheck2,
  PILOT_CONTRACTED:FileSignature,
  PILOT_DELIVERED:PackageCheck,
  PRODUCTION_NEGOTIATED:Handshake,
  CLOSED_WON:Trophy
};
export function StageIcon({stage,size=16}:{stage:StageId;size?:number}){const Icon=icons[stage]||HelpCircle;return <Icon size={size} strokeWidth={1.85} aria-hidden="true"/>}
