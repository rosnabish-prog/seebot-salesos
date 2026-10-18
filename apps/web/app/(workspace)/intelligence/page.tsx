import {redirect} from 'next/navigation';
/** Legacy v1.4 route. AI tools now live inside each Opportunity Workspace. */
export default function IntelligenceLegacyRedirect(){redirect('/prospects');}
