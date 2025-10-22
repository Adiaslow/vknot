import{r as a}from"./index.CVf8TyFT.js";var p={exports:{}},u={};/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var y=a,C=Symbol.for("react.element"),x=Symbol.for("react.fragment"),h=Object.prototype.hasOwnProperty,v=y.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,E={key:!0,ref:!0,__self:!0,__source:!0};function f(r,e,o){var t,n={},s=null,i=null;o!==void 0&&(s=""+o),e.key!==void 0&&(s=""+e.key),e.ref!==void 0&&(i=e.ref);for(t in e)h.call(e,t)&&!E.hasOwnProperty(t)&&(n[t]=e[t]);if(r&&r.defaultProps)for(t in e=r.defaultProps,e)n[t]===void 0&&(n[t]=e[t]);return{$$typeof:C,type:r,key:s,ref:i,props:n,_owner:v.current}}u.Fragment=x;u.jsx=f;u.jsxs=f;p.exports=u;var A=p.exports;/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=r=>r.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),R=r=>r.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,o,t)=>t?t.toUpperCase():o.toLowerCase()),l=r=>{const e=R(r);return e.charAt(0).toUpperCase()+e.slice(1)},m=(...r)=>r.filter((e,o,t)=>!!e&&e.trim()!==""&&t.indexOf(e)===o).join(" ").trim(),b=r=>{for(const e in r)if(e.startsWith("aria-")||e==="role"||e==="title")return!0};/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var g={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=a.forwardRef(({color:r="currentColor",size:e=24,strokeWidth:o=2,absoluteStrokeWidth:t,className:n="",children:s,iconNode:i,...c},d)=>a.createElement("svg",{ref:d,...g,width:e,height:e,stroke:r,strokeWidth:t?Number(o)*24/Number(e):o,className:m("lucide",n),...!s&&!b(c)&&{"aria-hidden":"true"},...c},[...i.map(([_,w])=>a.createElement(_,w)),...Array.isArray(s)?s:[s]]));/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=(r,e)=>{const o=a.forwardRef(({className:t,...n},s)=>a.createElement(O,{ref:s,iconNode:e,className:m(`lucide-${k(l(r))}`,`lucide-${r}`,t),...n}));return o.displayName=l(r),o};export{L as c,A as j};
