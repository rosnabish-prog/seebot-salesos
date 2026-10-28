/** Application addresses are a single plain mailbox, never an RFC display-name or address list. */
export function isPlainEmail(value:unknown):value is string{
 if(typeof value!=='string'||value.length>254)return false;
 const parts=value.split('@');if(parts.length!==2||parts[0].length>64)return false;
 if(!/^[A-Za-z0-9][A-Za-z0-9._%+-]*$/.test(parts[0])||parts[0].includes('..')||parts[0].endsWith('.'))return false;
 const labels=parts[1].split('.');
 return labels.length>=2&&labels.every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))&&/^[A-Za-z]{2,63}$/.test(labels.at(-1)!);
}
