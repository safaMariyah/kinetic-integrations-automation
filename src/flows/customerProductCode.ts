import {one,identity,type Dataset} from '../support/datasets';
export const productCodeGaps=[
 'Establish active QuickShip server artifact-output provenance and approved read route before ERP mutations.',
];
export function requireProductCodeComplete():never {throw new Error('Customer Product Code blocked before mutation: '+productCodeGaps.join(' '));}
export function verifyCustomerPartReference(ds:Dataset,company:string,custNum:number,partNum:string,code:string):void {
 identity(one(ds,'CustXPrt'),{Company:company,CustNum:custNum,PartNum:partNum,XPartNum:code});
}
