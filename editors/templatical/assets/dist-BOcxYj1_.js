var Ct=Object.defineProperty;var wt=(t,n,e)=>n in t?Ct(t,n,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[n]=e;var w=(t,n,e)=>wt(t,typeof n!="symbol"?n+"":n,e);import{r as St,i as E,a as jt,b as Tt,c as At,d as vt,e as xt,f as Bt,g as Ft,h as Et,j as It,k as Rt,l as _t,m as nt,n as Ht,o as K,p as Mt,q as Lt,s as Nt,t as Dt,R as U,u as Pt,v as et,w as G,H as W,T as zt,x as Wt,y as Ot,B as Ut,z as Gt,A as qt,C as q,D as Vt,E as Yt,F as rt,G as Xt,I as it}from"./index-Csx8wBLZ.js";const st="https://cdn.jsdelivr.net/npm/@templatical/renderer@0.59.1/assets/social";var Zt=class ot{constructor(n,e,r,i,s=new Map,o=st,c={},a="ltr",u){w(this,"containerWidth");w(this,"customFonts");w(this,"defaultFallbackFont");w(this,"allowHtmlBlocks");w(this,"customBlockHtml");w(this,"socialIconsBaseUrl");w(this,"blockRenderers");w(this,"contentDirection");w(this,"contentWidth");this.containerWidth=n,this.customFonts=e,this.defaultFallbackFont=r,this.allowHtmlBlocks=i,this.customBlockHtml=s,this.socialIconsBaseUrl=o,this.blockRenderers=c,this.contentDirection=a,this.contentWidth=u??n}withContainerWidth(n,e=n){return new ot(n,this.customFonts,this.defaultFallbackFont,this.allowHtmlBlocks,this.customBlockHtml,this.socialIconsBaseUrl,this.blockRenderers,this.contentDirection,e)}resolveFontFamily(n){return St(n,{customFonts:this.customFonts,defaultFallback:this.defaultFallbackFont})}};const V={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"},at=/[&<>"']/g;function H(t){return t===""?"":t.replace(at,n=>V[n]??n)}function l(t){return t===""?"":t.replace(at,n=>V[n]??n)}function m(t){return t===""?"":l(t.replace(/[;{}\r\n]/g,""))}const Jt=/[&<>"]/g;function M(t){return t.replace(Jt,n=>V[n]??n)}function $(t){const n=t.visibility;return n?!n.desktop&&!n.mobile:!1}function p(t,n=[]){const e=[Kt(t),...n].filter(r=>r!=="").join(" ");return e===""?"":` css-class="${l(e)}"`}function Kt(t){const n=t.visibility;if(!n)return"";const e=[];return n.desktop||e.push("tpl-hide-desktop"),n.mobile||e.push("tpl-hide-mobile"),e.join(" ")}const Qt="templatical:unrenderable-block";function Q(t){return t.replace(/[<>]/g,"").replace(/-{2,}/g,"-")}function b(t){return JSON.stringify(String(t)).slice(1,-1)}function bt(t){console.warn(`[Templatical] No renderer for block type "${b(t.type)}" (id: ${b(t.id)}). A placeholder comment was emitted in its place. Pass a \`blockRenderers\` entry for this type to render it.`);const n=Q(t.type),e=Q(t.id);return`<mj-raw><!-- ${Qt} type="${n}" id="${e}" --></mj-raw>`}function h(t){return l(`${t.top}px ${t.right}px ${t.bottom}px ${t.left}px`)}function C(t,n){return t?` ${n==="native"?"background-color":"container-background-color"}="${m(t)}"`:""}function lt(t){return typeof t!="number"||!Number.isFinite(t)||t<=0?"":` height="${t}px"`}function L(t,n){const e=i=>Math.trunc(i??0),r=i=>Vt(i)===null?0:Math.trunc(i.width);return e(t==null?void 0:t.left)+e(t==null?void 0:t.right)+r(n==null?void 0:n.left)+r(n==null?void 0:n.right)}function ct(t,n){if(t.fluidOnMobile===!0)return' fluid-on-mobile="true"';if(t.fluidOnMobile===!1)return"";const e=Math.floor(n.contentWidth)-L(t.styles.padding,t.border);return t.width==="full"||t.width>=e?' fluid-on-mobile="true"':""}function Y(t){return Object.entries(Xt(t)).map(([n,e])=>` ${n}="${m(e)}"`).join("")}function N(t){const n=rt(t);return n===null?"":` border-radius="${m(n)}"`}function ut(t){const n=Yt(t);return n===null?"":` background-url="${l(n.url)}" background-size="${m(n.size)}" background-position="${m(n.position)}" background-repeat="${m(n.repeat)}"`}const D="tpl-rich-text";function X(t){return`${D}-${t}`}function kt(t,n="ltr"){const e=U,r=`.${D}`,i=[...new Set(t)].sort((o,c)=>o-c).flatMap(o=>{const c=`.${X(o)}`;return[`${c} p { margin: 0 0 ${o}px; }`,`${c} p:last-child { margin-bottom: 0; }`]}),s=n==="rtl"?"padding-right":"padding-left";return[...i,`${r} ul, ${r} ol { margin: ${e.listMarginY}px 0; ${s}: ${e.listPaddingLeft}px; }`,`${r} li { margin: ${e.listItemMarginY}px 0; }`].join(`
      `)}function Z(t){return t??U.paragraphGap}function tn(t){const n=[U.paragraphGap],e=r=>{if(r.type==="paragraph"&&n.push(Z(r.paragraphSpacing)),E(r))for(const i of r.children)for(const s of i)e(s);else if(q(r))for(const i of r.children)e(i)};for(const r of t)e(r);return n}const nn={apos:"'",quot:'"',nbsp:" "},en=/&(?:#(\d+)|#x([0-9a-f]+)|(apos|quot|nbsp));/gi,rn=/[a-z]/i,I=/[ \t\n\f\r]/;function sn(t,n,e,r,i){let s;if(i!==void 0)s=nn[i.toLowerCase()];else{const o=Number(e??`0x${r}`);if(!(o>0&&o<=1114111&&!(o>=55296&&o<=57343)))return t;s=String.fromCodePoint(o)}return s==="&"?"&amp;":s==="<"||s===">"?t:s===n?n==='"'?"'":'"':s}function on(t){let n=1;for(;n<t.length&&!I.test(t[n])&&t[n]!=="/";)n++;for(;n<t.length;){for(;n<t.length&&(I.test(t[n])||t[n]==="/");)n++;const e=n;for(;n<t.length&&!/[\s=/]/.test(t[n]);)n++;const r=t.slice(e,n).toLowerCase();if(r===""){n++;continue}for(;n<t.length&&I.test(t[n]);)n++;if(t[n]!=="=")continue;for(n++;n<t.length&&I.test(t[n]);)n++;const i=t[n];if(i==='"'||i==="'"){const s=t.indexOf(i,n+1);if(s===-1)return t;if(r==="style"){const o=t.slice(n+1,s).replace(en,(c,a,u,f)=>sn(c,i,a,u,f));return`${t.slice(0,n+1)}${o}${t.slice(s)}`}n=s+1;continue}for(;n<t.length&&!I.test(t[n]);)n++}return t}function dt(t){if(!t.includes("&"))return t;let n="",e=0,r=t.indexOf("<");for(;r!==-1;){if(!rn.test(t.charAt(r+1))){r=t.indexOf("<",r+1);continue}const i=it(t,r+1);if(i===-1)break;const s=t.slice(r,i),o=on(s);o!==s&&(n+=t.slice(e,r)+o,e=i),r=t.indexOf("<",i)}return n+t.slice(e)}function an(t,n){if($(t))return"";const e=h(t.styles.padding),r=C(t.styles.backgroundColor,"container"),i=ln(dt(et(G(t.content)))),s=W[t.level]??W[2],o=t.color?`
  color="${l(t.color)}"`:"",c=l(t.textAlign),a=cn(t.fontFamily,n),u=p(t,[D,X(Z(void 0))]),f=`h${W[t.level]?t.level:2}`;return`<mj-text
  font-size="${s}px"${o}
  align="${c}"
  line-height="${zt}"
  padding="${e}"${r}${a}${u}
><${f} style="margin:0;font-size:inherit;color:inherit;line-height:inherit;font-weight:${Wt}">${i}</${f}></mj-text>`}function ln(t){const n=/^\s*<p\b/.exec(t);if(!n)return t;const e=it(t,n[0].length);if(e===-1)return t;const r=/<\/p>\s*$/.exec(t);if(!r||r.index<=e)return t;const i=t.slice(e+1,r.index);return/<\/p>\s*<p\b/i.test(i)?t:i}function cn(t,n){return t?` font-family="${M(n.resolveFontFamily(t))}"`:""}function un(t,n){if($(t)||Ot(t.content))return"";const e=h(t.styles.padding),r=C(t.styles.backgroundColor,"container"),i=dt(et(G(t.content))),s=p(t,[D,X(Z(t.paragraphSpacing))]);return`<mj-text
  line-height="1.5"${n.contentDirection==="rtl"?`
  align="right"`:""}
  padding="${e}"${r}${s}
>${i}</mj-text>`}function dn(t,n){if($(t)||t.src==="")return"";const e=h(t.styles.padding),r=C(t.styles.backgroundColor,"container"),i=l(t.width==="full"?n.containerWidth+"px":t.width+"px"),s=lt(t.height),o=ct(t,n),c=p(t),a=N(t.borderRadius),u=Y(t.border);let f="";t.linkUrl&&(f=` href="${l(t.linkUrl)}"`,t.linkOpenInNewTab&&(f+=' target="_blank" rel="noopener"'));const g=l(t.src),d=t.decorative===!0;return`<mj-image
  src="${g}"
  alt="${d?"":l(t.alt)}"
  width="${i}"${s}${o}
  align="${l(t.align)}"
  padding="${e}"${r}${u}${a}${f}${c}${d?' role="presentation"':""}
/>`}const ft="tpl-button-full";function fn(t,n){if($(t))return"";const e=h(t.styles.padding),r=C(t.styles.backgroundColor,"container"),i=h(t.buttonPadding),s=t.url===""?"":l(t.url),o=s===""?"":` href="${s}"`,c=gn(t.backgroundColor),a=l(t.textColor),u=t.fontSize,f=mn(t.fontWeight),g=l($n(t.borderRadius)),d=H(t.text),T=t.openInNewTab?' target="_blank" rel="noopener"':"",A=hn(t.fontFamily,n),S=pn(t.width),v=p(t,t.width==="full"?[ft]:[]),j=Y(t.border),x=l(t.align??"center");return`<mj-button${o}${T}
  background-color="${c}"
  color="${a}"
  font-size="${l(String(u))}px"
  line-height="${Math.round(Ut*100)}%"
  font-weight="${f}"
  border-radius="${g}"${j}
  inner-padding="${i}"
  align="${x}"
  padding="${e}"${r}${A}${S}${v}
>${d}</mj-button>`}function gn(t){return t.trim()===""?"transparent":l(t)}function mn(t){return t==="regular"?"400":t==="medium"?"500":t==="bold"?"700":"bold"}function hn(t,n){return t?` font-family="${M(n.resolveFontFamily(t))}"`:""}function $n(t){return typeof t=="number"?`${t}px`:rt(t)??"0px"}function pn(t){return t===void 0?"":` width="${l(t==="full"?"100%":`${t}px`)}"`}function yn(t,n){if($(t))return"";const e=h(t.styles.padding),r=t.styles.backgroundColor?` container-background-color="${l(t.styles.backgroundColor)}"`:"",i=t.width==="full"?"100%":typeof t.width=="number"?`${t.width}px`:t.width,s=t.thickness,o=l(t.lineStyle),c=l(t.color),a=p(t);return`<mj-divider
  border-width="${l(String(s))}px"
  border-style="${o}"
  border-color="${c}"
  width="${l(i)}"
  padding="${e}"${r}${a}
/>`}function Cn(t,n){if($(t))return"";const e=t.height,r=t.styles.backgroundColor?` container-background-color="${l(t.styles.backgroundColor)}"`:"",i=p(t);return`<mj-spacer height="${l(String(e))}px" padding="0"${r}${i} />`}function wn(t,n){if($(t)||!n.allowHtmlBlocks)return"";const e=t.content;if(e==="")return"";const r=p(t);return`<mj-text padding="${h(t.styles.padding)}"${C(t.styles.backgroundColor,"container")}${r}>
${e}
</mj-text>`}function Sn(t,n){if($(t))return"";const e=t.icons;if(e.length===0)return"";const r=h(t.styles.padding),i=t.styles.backgroundColor?` container-background-color="${l(t.styles.backgroundColor)}"`:"",s=p(t),o=l(t.align),c=t.iconSize,a=t.iconStyle,u=l(Gt(a,t.iconTone)),f=t.spacing;let g;switch(c){case"small":g=24;break;case"large":g=48;break;default:g=32}let d;switch(a){case"circle":d="50%";break;case"rounded":d="8px";break;case"square":d="0";break;default:d="4px"}const T=e.length;return`<mj-social
  mode="horizontal"
  align="${o}"
  icon-padding="0"
  padding="${r}"${i}${s}
>
${e.map((A,S)=>{const v=l(A.platform),j=l(A.url),x=`${n.socialIconsBaseUrl}/${u}/${v}.png`,y=S===T-1?0:f;return`<mj-social-element src="${x}" href="${j}" icon-size="${g}px" padding="0 ${l(String(y))}px 0 0" border-radius="${d}" background-color="transparent"></mj-social-element>`}).join(`
`)}
</mj-social>`}function jn(t,n){if($(t)||t.items.length===0)return"";const e=h(t.styles.padding),r=C(t.styles.backgroundColor,"container"),i=p(t),s=vn(t.fontFamily,n),o=l(t.textAlign),c=t.fontSize,a=t.color?`
  color="${l(t.color)}"`:"",u=Tn(t);return`<mj-text
  font-size="${l(String(c))}px"${a}
  align="${o}"
  line-height="1.5"
  padding="${e}"${r}${s}${i}
>${u}</mj-text>`}function Tn(t){const n=t.items,e=H(t.separator),r=m(t.separatorColor),i=t.spacing,s=t.linkColor??t.color,o=[],c=n.length;for(let a=0;a<c;a++)o.push(An(n[a],s)),a<c-1&&o.push(`<span style="color: ${r}; padding: 0 ${m(String(i))}px;">${e}</span>`);return o.join("")}function An(t,n){const e=H(t.text),r=l(t.url),i=t.color??n,s=t.openInNewTab?' target="_blank" rel="noopener"':"",o=["text-decoration: none"];return i&&o.unshift(`color: ${m(i)}`),t.bold&&o.push("font-weight: bold"),t.underline&&o.push("text-decoration: underline"),`<a href="${r}" style="${o.join("; ")}"${s}>${e}</a>`}function vn(t,n){return t?` font-family="${M(n.resolveFontFamily(t))}"`:""}function xn(t,n){if($(t)||t.rows.length===0)return"";const e=h(t.styles.padding),r=C(t.styles.backgroundColor,"container"),i=p(t),s=In(t.fontFamily,n),o=t.fontSize,c=t.color?`
  color="${l(t.color)}"`:"",a=l(t.textAlign),u=Bn(t);return`<mj-text
  font-size="${l(String(o))}px"${c}
  align="${a}"
  line-height="1.5"
  padding="${e}"${r}${s}${i}
>${u}</mj-text>`}function Bn(t){const n=m(t.borderColor),e=t.borderWidth,r="width: 100%; border-collapse: collapse;";let i="";for(let s=0;s<t.rows.length;s++){const o=t.rows[s],c=t.hasHeaderRow&&s===0;i+=Fn(o,t,c,n,e)}return`<table style="${r}">${i}</table>`}function Fn(t,n,e,r,i){let s="";for(const o of t.cells)s+=En(o,n,e,r,i);return`<tr>${s}</tr>`}function En(t,n,e,r,i){const s=n.cellPadding,o=[`border: ${m(String(i))}px solid ${r}`,`padding: ${m(String(s))}px`];e&&(o.push("font-weight: bold"),n.headerBackgroundColor&&o.push(`background-color: ${m(n.headerBackgroundColor)}`));const c=o.join("; "),a=H(G(t.content)),u=e?"th":"td";return`<${u} style="${c}">${a}</${u}>`}function In(t,n){return t?` font-family="${M(n.resolveFontFamily(t))}"`:""}function Rn(t,n){if($(t))return"";const e=n.customBlockHtml.get(t.id)??t.renderedHtml;if(!e||e==="")return"";const r=p(t);return`<mj-text padding="${h(t.styles.padding)}"${C(t.styles.backgroundColor,"container")}${r}>
${e}
</mj-text>`}function _n(t){switch(t){case"2":return["50%","50%"];case"3":return["33.33%","33.33%","33.34%"];case"4":return["25%","25%","25%","25%"];case"1-2":return["33.33%","66.67%"];case"2-1":return["66.67%","33.33%"];case"1-3":return["25%","75%"];case"3-1":return["75%","25%"];case"1-2-1":return["25%","50%","25%"];default:return["100%"]}}function Hn(t,n){switch(t){case"2":return[n*.5,n*.5];case"3":return[n/3,n/3,n/3];case"4":return[n*.25,n*.25,n*.25,n*.25];case"1-2":return[n/3,n*2/3];case"2-1":return[n*2/3,n/3];case"1-3":return[n*.25,n*.75];case"3-1":return[n*.75,n*.25];case"1-2-1":return[n*.25,n*.5,n*.25];default:return[n]}}function Mn(t,n,e){const r=Math.max(1,Math.round(n)),i=t.aspectRatio===null?null:Math.max(1,Math.round(r*t.aspectRatio)),s=t.height==="image"?i??r:t.height,o=Math.max(s,Math.trunc(e.top)+Math.trunc(e.bottom));return{mode:"fixed-height",height:o,backgroundWidth:r,backgroundHeight:i??o}}function R(t,n){if(n==="")return"";const e=t.displayCondition;return e?`<mj-raw>${e.before}</mj-raw>
`+n+`
<mj-raw>${e.after}</mj-raw>`:n}function Ln(t,n,e){if($(t))return"";const r=Pt(t);if(r!=null&&r.applied)return Nn(t,r,n,e);const i=t.columns,s=_n(i),o=Hn(i,n.containerWidth),c=Math.floor(n.contentWidth)-L(t.styles.padding,t.border),a=s.map(y=>Math.floor(c*parseFloat(y)/100)),u=h(t.styles.padding),f=C(t.styles.backgroundColor,"native"),g=ut(t.backgroundImage),d=p(t),T=N(t.borderRadius),A=Y(t.border),S=n.contentDirection==="rtl"?' direction="rtl"':"",v=t.children,j=[];for(let y=0;y<v.length;y++){const P=v[y],z=s[y]??"100%",B=Math.floor(o[y]??n.containerWidth),$t=gt(P,n.allowHtmlBlocks).filter(F=>!E(F)),pt=n.withContainerWidth(B,a[y]??c),J=$t.map(F=>R(F,e(F,pt))).filter(F=>F!=="").join(`
`),yt=J===""?"<mj-text>&nbsp;</mj-text>":J;j.push(`<mj-column width="${z}"${S}>
${yt}
</mj-column>`)}const x=j.join(`
`);return`<mj-section${f}${g} padding="${u}"${A}${T}${d}${S}>
${t.stackOnMobile===!1&&j.length>1?`<mj-group${S}>
${x}
</mj-group>`:x}
</mj-section>`}function Nn(t,n,e,r){const i=Math.floor(e.contentWidth),s=Mn(n,i,t.styles.padding),o=C(t.styles.backgroundColor,"native")||' background-color="transparent"',c=h(t.styles.padding),a=N(t.borderRadius),u=p(t),f=e.withContainerWidth(i,i-L(t.styles.padding)),g=gt(t.children[0]??[],e.allowHtmlBlocks).filter(d=>!E(d)).map(d=>R(d,r(d,f))).filter(d=>d!=="").join(`
`);return`<mj-hero mode="${s.mode}" height="${s.height}px" background-url="${l(n.image.url)}" background-width="${s.backgroundWidth}px" background-height="${s.backgroundHeight}px" background-position="${l(n.image.position)}"${o} padding="${c}" vertical-align="${l(n.verticalAlign)}"${a}${u}>
${g}
</mj-hero>`}function gt(t,n){return n?t:t.filter(e=>e.type!=="html")}function Dn(t,n){if(n)return n;if(!t)return null;for(const r of[/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/]){const i=t.match(r);if(i)return`https://img.youtube.com/vi/${i[1]}/maxresdefault.jpg`}const e=t.match(/vimeo\.com\/(?:video\/)?(\d+)/);return e?`https://vumbnail.com/${e[1]}.jpg`:null}function Pn(t,n){if($(t))return"";const e=Dn(t.url,t.thumbnailUrl);if(!e)return"";const r=h(t.styles.padding),i=C(t.styles.backgroundColor,"container"),s=l(t.width==="full"?n.containerWidth+"px":t.width+"px"),o=lt(t.height),c=ct(t,n),a=p(t);return`<mj-image
  src="${l(e)}"
  alt="${l(t.alt)}"
  width="${s}"${o}${c}
  align="${l(t.align)}"
  padding="${r}"
  href="${l(t.url)}"
  target="_blank"
  rel="noopener"${i}${a}
/>`}function O(t,n){const e=n.blockRenderers[t.type];return e?e(t,n):E(t)?Ln(t,n,O):jt(t)?an(t,n):Tt(t)?un(t,n):At(t)?dn(t,n):vt(t)?fn(t,n):xt(t)?yn(t):Bt(t)?Cn(t):Ft(t)?wn(t,n):Et(t)?Sn(t,n):It(t)?jn(t,n):Rt(t)?xn(t,n):_t(t)?Pn(t,n):nt(t)?Rn(t,n):$(t)?"":bt(t)}const zn=`.${ft} a { display: block !important; }`;async function Kn(t,n){if((n==null?void 0:n.customBlocks)!==void 0&&n.renderCustomBlock!==void 0)throw new TypeError("[Templatical] customBlocks cannot be combined with renderCustomBlock");if((n==null?void 0:n.customBlocks)!==void 0&&n.getCustomBlockStylesheet!==void 0)throw new TypeError("[Templatical] customBlocks cannot be combined with getCustomBlockStylesheet");const e=(n==null?void 0:n.locale)??Ht(t),r=K(t,e),i=n!=null&&n.layout?Mt(K(n.layout,e,{missing:"default"}),r):(Lt(r),Nt(r),r),s=(n==null?void 0:n.customFonts)??[],o=(n==null?void 0:n.defaultFallbackFont)??"Arial, sans-serif",c=(n==null?void 0:n.allowHtmlBlocks)??!0,a=On((n==null?void 0:n.socialIconsBaseUrl)??st),u=(n==null?void 0:n.customBlocks)!==void 0?await Vn(i,n.customBlocks,n.liquidjs):await qn(i,n==null?void 0:n.renderCustomBlock),f=Yn(i,n==null?void 0:n.getCustomBlockStylesheet,(n==null?void 0:n.customBlocks)===void 0?void 0:new Map(n.customBlocks.map(B=>[B.type,B]))),g=Dt(i.settings),d=new Zt(i.settings.width,s,o,c,u,a,(n==null?void 0:n.blockRenderers)??{},g),T=ht(i.blocks,c),A=d.resolveFontFamily(i.settings.fontFamily),S=/[<>]/.test(i.settings.backgroundColor)?"transparent":i.settings.backgroundColor,v=i.settings.textColor?` color="${l(i.settings.textColor)}"`:"",j=i.settings.linkColor?m(i.settings.linkColor):"inherit",x=i.settings.linkUnderline?"underline":"none",y=T.map(B=>mt(B,d)).filter(B=>B!=="").join(`
`),P=Gn(s),z=Un(i.settings.preheaderText);return`<mjml lang="${l(i.settings.locale)}" dir="${l(g)}">
  <mj-head>${z}
    <mj-attributes>
      <mj-all font-family="${M(A)}" />
      <mj-text font-size="14px"${v} />
      <mj-section padding="0" />
      <mj-column padding="0" />
    </mj-attributes>${P}
    <mj-style inline="inline">
      ${kt(tn(T),g)}
      ${zn}
    </mj-style>
    <mj-style>
      a { color: ${j}; text-decoration: ${x}; }
      @media only screen and (max-width: 480px) {
        .tpl-hide-mobile { display: none !important; mso-hide: all !important; }
      }
      @media only screen and (min-width: 481px) {
        .tpl-hide-desktop { display: none !important; mso-hide: all !important; }
      }
    </mj-style>${Xn(f)}
  </mj-head>
  <mj-body width="${l(String(d.containerWidth))}px" background-color="${m(S)}">
${y}
  </mj-body>
</mjml>`}function mt(t,n){if(q(t)){const e=k(n,t.styles.padding);return R(t,tt(ht(t.children,n.allowHtmlBlocks).map(r=>mt(r,e)).filter(r=>r!=="").join(`
`),{backgroundColor:t.styles.backgroundColor,padding:t.styles.padding,borderRadius:t.borderRadius,backgroundImage:t.backgroundImage,fullWidth:t.fullWidth},n.contentDirection))}if(E(t)){const e=O(t,t.wrapper?k(n,t.wrapper.padding):n);return R(t,t.wrapper&&e!==""?tt(e,t.wrapper,n.contentDirection):e)}return R(t,Wn(O(t,n),n.contentDirection))}function k(t,n){return t.withContainerWidth(t.containerWidth,Math.floor(t.contentWidth)-L(n))}function tt(t,n,e){return`<mj-wrapper${C(n.backgroundColor,"native")}${ut(n.backgroundImage)}${` padding="${n.padding?h(n.padding):"0"}"`}${n.fullWidth?"":N(n.borderRadius)}${n.fullWidth?' full-width="full-width"':""}${e==="rtl"?' direction="rtl"':""}>
${t}
</mj-wrapper>`}function Wn(t,n){if(t==="")return"";const e=n==="rtl"?' direction="rtl"':"";return`<mj-section${e}>
  <mj-column${e}>
${t}
  </mj-column>
</mj-section>`}function On(t){return t.endsWith("/")?t.slice(0,-1):t}function Un(t){if(!t)return"";const n=t.trim();return n===""?"":`
    <mj-preview>${H(n)}</mj-preview>`}function Gn(t){return t.length===0?"":t.map(n=>`
    <mj-font name="${l(n.name)}" href="${l(n.url)}" />`).join("")}function ht(t,n){return n?t:t.filter(e=>e.type!=="html")}async function qn(t,n){const e=new Map;if(!n)return e;const r=[];if(_(t.blocks,r),r.length===0)return e;const i=await Promise.all(r.map(s=>n(s)));for(let s=0;s<r.length;s++)e.set(r[s].id,i[s]);return e}async function Vn(t,n,e){const r=new Map,i=[];if(_(t.blocks,i),i.length===0)return r;if(typeof(e==null?void 0:e.Liquid)!="function")throw new TypeError('[Templatical] customBlocks requires the liquidjs option: import * as liquidjs from "liquidjs" and pass { customBlocks, liquidjs }.');const s=qt(e),o=new Map(n.map(a=>[a.type,a])),c=await Promise.all(i.map(async a=>{const u=o.get(a.customType);return u?String(await s.parseAndRender(u.template,a.fieldValues)):void 0}));for(let a=0;a<i.length;a++){const u=c[a];u!==void 0&&r.set(i[a].id,u)}return r}function _(t,n){for(const e of t){if(nt(e)){n.push(e);continue}if(E(e))for(const r of e.children)_(r,n);else q(e)&&_(e.children,n)}}function Yn(t,n,e){const r=[];if(_(t.blocks,r),r.length===0)return[];const i=new Map;if(!n)for(const a of r)a.renderedStylesheet&&!i.has(a.customType)&&i.set(a.customType,a.renderedStylesheet);const s=new Set,o=new Set,c=[];for(const a of r){if(s.has(a.customType))continue;s.add(a.customType);const u=e==null?void 0:e.get(a.customType),f=n?n(a.customType):u?u.stylesheet:i.get(a.customType);if(!f)continue;const g=f.trim();g===""||o.has(g)||(o.add(g),c.push(g))}return c}function Xn(t){return t.length===0?"":t.map(n=>`
    <mj-style>
${n.replaceAll("<","\\3c ")}
    </mj-style>`).join("")}export{ft as BUTTON_FULL_WIDTH_CSS_CLASS,st as DEFAULT_SOCIAL_ICONS_BASE_URL,D as RICH_TEXT_CSS_CLASS,Zt as RenderContext,Qt as UNRENDERABLE_MARKER_PREFIX,G as convertMergeTagsToValues,l as escapeAttr,H as escapeHtml,ct as fluidOnMobileAttr,p as getCssClassAttr,Kt as getCssClasses,_n as getWidthPercentages,Hn as getWidthPixels,$ as isHiddenOnAll,O as renderBlock,Kn as renderToMjml,bt as renderUnrenderableBlock,Z as resolveParagraphGap,X as richTextGapClass,h as toPaddingString};
