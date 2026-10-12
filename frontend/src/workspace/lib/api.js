import axios from 'axios';
export const BASE=process.env.REACT_APP_BACKEND_URL;
export const api=axios.create({baseURL:`${BASE}/api/workspace`,withCredentials:true});
const site=axios.create({baseURL:`${BASE}/api`,withCredentials:true});
let refreshing=null;
export const refreshSession=()=>{
 if(!refreshing)refreshing=site.post('/auth/refresh',{}).finally(()=>{refreshing=null;});
 return refreshing;
};
export const siteLogout=()=>site.post('/auth/logout');
api.interceptors.response.use(r=>r,async error=>{
 const config=error.config;
 if(error.response?.status===401&&!config._retry){
  config._retry=true;
  try{await refreshSession();return api(config);}catch(e){window.dispatchEvent(new Event('session-expired'));}
 }
 return Promise.reject(error);
});
export const errorText=e=>typeof e.response?.data?.detail==='string'?e.response.data.detail:e.response?.status===422?'Please check the fields and try again.':'Something went wrong. Please try again.';
export const refreshData=()=>window.dispatchEvent(new Event('crm-refresh'));
export const money=(n,compact=false)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0,...(compact?{notation:'compact',maximumFractionDigits:1}:{})}).format(n||0);
export const dateLabel=d=>d?new Date(d.length===10?d+'T12:00:00':d).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
export const initials=n=>(n||'').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
export const today=()=>new Date().toLocaleDateString('en-CA');
