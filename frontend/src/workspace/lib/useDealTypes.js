import {useData} from './useData';
export const useDealTypes=()=>{
 const {data:config}=useData('/deal-config');
 return config?.deal_types||[];
};
