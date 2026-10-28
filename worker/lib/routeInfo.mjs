import {routeInfoFor,timeOverride} from '../../shared/routeEstimate.mjs';
import {GameError} from './patrac-engine.mjs';
export function validatedRouteInfo(input,stations){
 const raw=timeOverride(input),override=raw===null?null:Number(raw);
 if(raw!==null&&(raw===''||typeof raw==='boolean'||!Number.isInteger(override)||override<5||override>1440))throw new GameError('Odhad správce musí být celé číslo od 5 do 1440 minut.');
 return{timeEstimateOverride:override,routeInfo:routeInfoFor({stations,timeEstimateOverride:override})};
}

// List/detail queries load only coordinates for the calculation, never whole riddles or hints.
export const routeEstimateSQL=`json_object('stations',json((SELECT json_group_array(json_object('lat',json_extract(s.value,'$.lat'),'lng',json_extract(s.value,'$.lng'))) FROM json_each(e.payload,'$.stations') s)),
 'timeEstimateOverride',CASE WHEN json_type(e.payload,'$.timeEstimateOverride') IS NULL THEN json_extract(e.payload,'$.publicInfo.estimatedMinutes') ELSE json_extract(e.payload,'$.timeEstimateOverride') END)`;
