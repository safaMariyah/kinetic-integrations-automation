import {one,identity,type Dataset} from '../support/datasets';
export const productCodeGaps: string[]=[];
export function requireProductCodeComplete(artifactProvenanceConfirmed=false):void {
 if(!artifactProvenanceConfirmed)throw new Error('Customer Product Code blocked before mutation: confirmed artifact provenance required.');
}
export function verifyCustomerPartReference(ds:Dataset,company:string,custNum:number,partNum:string,code:string):void {
 identity(one(ds,'CustXPrt'),{Company:company,CustNum:custNum,PartNum:partNum,XPartNum:code});
}

/** Check selection before quantity/save so a different internal part cannot be ordered. */
export function verifySelectedCustomerPart(ds: Dataset, expected: {partNum: string; code: string; revision?: string}): void {
 const line = one(ds, 'OrderDtl');
 if (line.PartNum !== expected.partNum) {
  const safePart = (value: unknown) => typeof value === 'string' && /^APIPOC-[a-f0-9]{32}$/.test(value) ? value : '[identity withheld]';
  throw new Error(`Customer-part selection returned a different internal part. Expected scenario part ${safePart(expected.partNum)}; returned ${safePart(line.PartNum)}. The order line has not been saved. Inspect customer-code/revision mappings; do not replay stock or mapping creation to recover.`);
 }
 identity(line, {XPartNum: expected.code, ...(expected.revision !== undefined ? {XRevisionNum: expected.revision} : {})});
}
