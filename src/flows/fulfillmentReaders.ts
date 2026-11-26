import {parameters,returned,rows,type Row} from '../support/datasets';
export function verifyMovedQueueAbsent(body:Row,company:string,queueSeq:number):void {
 if(parameters(body).morePages!==false)throw new Error('Queue disappearance requires complete bounded result.');
 if(rows(returned(body),'MtlQueue').some(r=>r.Company===company&&r.MtlQueueSeq===queueSeq))throw new Error('Moved queue remains visible; stop dependent shipment actions.');
}
