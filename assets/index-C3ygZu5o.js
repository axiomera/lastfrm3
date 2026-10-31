(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`// GHOST IR — rdzeń tonalny. Musi odpowiadać ghostIr.cpu.ts 1:1.
uniform float u_foliage;   // FOLIAGE WHITE 0..1
uniform float u_sky;       // SKY DARKNESS 0..1
uniform float u_contrast;  // IR CONTRAST 0..1
uniform float u_variant;   // 0 MONO, 1 CYAN, 2 PINK

vec3 ghostTone(vec3 c) {
  vec3 hsv = rgb2hsv(c);

  // Miękkie maski: pasma barwy * nasycenie * jasność. Wszystko smoothstep,
  // więc nie ma twardych krawędzi wokół liści.
  float foliage = band(hsv.x, 0.17, 0.46, 0.05) * smoothstep(0.10, 0.28, hsv.y) * smoothstep(0.06, 0.18, hsv.z);
  float sky     = band(hsv.x, 0.50, 0.70, 0.04) * smoothstep(0.10, 0.25, hsv.y) * smoothstep(0.30, 0.55, hsv.z);

  // Konwersja "kanałowa" jak w filtrze podczerwieni: mało niebieskiego.
  float b = dot(c, vec3(0.35, 0.60, 0.05));

  float fb = foliage * u_foliage;
  float sd = sky * u_sky;

  // Roślinność: miękkie ramię (bez przepaleń), zachowuje cieniowanie liści.
  float fol = 1.0 - exp(-(b * 2.6 + 0.08) * 1.35);
  float y = mix(b, fol, fb);
  y *= 1.0 - 0.92 * sd;
  y = clamp(y, 0.0, 1.0);

  // Kontrast IR: krzywa S + lekkie rozciągnięcie wokół środka.
  y = mix(y, y * y * (3.0 - 2.0 * y), u_contrast);
  y = clamp((y - 0.5) * (1.0 + 0.35 * u_contrast) + 0.5, 0.0, 1.0);

  vec3 col;
  if (u_variant < 0.5) {
    col = vec3(y) * vec3(0.985, 1.0, 1.02);
  } else if (u_variant < 1.5) {
    col = mix(vec3(0.015, 0.06, 0.10), vec3(0.90, 0.985, 1.0), pow(y, 0.92));
  } else {
    vec3 base  = mix(vec3(0.03, 0.09, 0.15), vec3(0.93, 0.92, 0.96), y);
    vec3 pink  = mix(vec3(0.50, 0.10, 0.32), vec3(1.0, 0.74, 0.86), y);
    vec3 skyc  = mix(vec3(0.0, 0.06, 0.11), vec3(0.06, 0.32, 0.40), y);
    col = mix(base, pink, fb * 0.95);
    col = mix(col, skyc, sd * 0.9);
  }
  return col;
}

vec3 ghostBloomTint() {
  if (u_variant < 0.5) return vec3(1.0);
  if (u_variant < 1.5) return vec3(0.85, 0.97, 1.0);
  return vec3(1.0, 0.85, 0.95);
}
`,t=`// Pass 1: ton GHOST IR -> wyciągnięcie jasnych partii do tekstury 1/4 rozdzielczości.
// 4 próbki dwuliniowe (±1 teksel) = filtr pudełkowy 4x4 przy zmniejszaniu.
uniform sampler2D u_in0;
uniform vec2 u_srcTexel;
void main() {
  vec3 a = ghostTone(texture(u_in0, v_uv + u_srcTexel * vec2(-1.0, -1.0)).rgb);
  vec3 b = ghostTone(texture(u_in0, v_uv + u_srcTexel * vec2( 1.0, -1.0)).rgb);
  vec3 c = ghostTone(texture(u_in0, v_uv + u_srcTexel * vec2(-1.0,  1.0)).rgb);
  vec3 d = ghostTone(texture(u_in0, v_uv + u_srcTexel * vec2( 1.0,  1.0)).rgb);
  vec3 t = (a + b + c + d) * 0.25;
  o_color = vec4(max(t - vec3(0.55), vec3(0.0)) * 2.2, 1.0);
}
`,n=`// Rozmycie gaussowskie, 9 próbek, jeden kierunek (u_dir w jednostkach UV).
uniform sampler2D u_in0;
uniform vec2 u_dir;
void main() {
  const float W[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 r = texture(u_in0, v_uv).rgb * W[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = u_dir * float(i);
    r += (texture(u_in0, v_uv + o).rgb + texture(u_in0, v_uv - o).rgb) * W[i];
  }
  o_color = vec4(r, 1.0);
}
`,r=`// Pass 4: ton + bloom, wymieszany z oryginałem wg INTENSITY.
uniform sampler2D u_in0; // oryginał
uniform sampler2D u_in1; // rozmyty bloom (1/4 rozdzielczości)
uniform float u_bloom;
uniform float u_intensity;
void main() {
  vec3 c = texture(u_in0, v_uv).rgb;
  vec3 t = ghostTone(c);
  vec3 bl = texture(u_in1, v_uv).rgb;
  vec3 col = clamp(t + bl * u_bloom * ghostBloomTint(), 0.0, 1.0);
  o_color = vec4(mix(c, col, u_intensity), 1.0);
}
`,i=[{kind:`enum`,id:`variant`,label:`VARIANT`,default:0,options:[{value:0,label:`MONO`},{value:1,label:`CYAN`},{value:2,label:`PINK`}]},{kind:`number`,id:`foliage_white`,label:`FOLIAGE WHITE`,min:0,max:1,step:.01,default:.8},{kind:`number`,id:`sky_darkness`,label:`SKY DARKNESS`,min:0,max:1,step:.01,default:.7},{kind:`number`,id:`ir_contrast`,label:`IR CONTRAST`,min:0,max:1,step:.01,default:.45},{kind:`number`,id:`bloom`,label:`BLOOM`,min:0,max:1,step:.01,default:.3},{kind:`number`,id:`intensity`,label:`INTENSITY`,min:0,max:1,step:.01,default:1}],a=.008,o=.55,s=2.2,c=e=>e<0?0:e>1?1:e,l=(e,t,n)=>e+(t-e)*n;function u(e,t,n){let r=c((n-e)/(t-e));return r*r*(3-2*r)}function d(e,t,n,r){return u(t-r,t+r,e)*(1-u(n-r,n+r,e))}function f(e,t,n){let r=Math.max(e,t,n),i=r-Math.min(e,t,n),a=0;return i>1e-10&&(a=r===e?((t-n)/i%6+6)%6:r===t?(n-e)/i+2:(e-t)/i+4,a/=6),[a,i/(r+1e-10),r]}function p(e,t,n){let r=r=>{let i=e+r,a=i-Math.floor(i);return n*l(1,c(Math.abs(a*6-3)-1),t)};return[r(1),r(2/3),r(1/3)]}function m(e,t,n,r,i,a=0){let[o,s,p]=f(e,t,n),m=d(o,.17,.46,.05)*u(.1,.28,s)*u(.06,.18,p),h=d(o,.5,.7,.04)*u(.1,.25,s)*u(.3,.55,p),g=e*.35+t*.6+n*.05,_=m*r.foliage_white,v=h*r.sky_darkness,y=l(g,1-Math.exp(-(g*2.6+.08)*1.35),_);y*=1-.92*v,y=c(y),y=l(y,y*y*(3-2*y),r.ir_contrast),y=c((y-.5)*(1+.35*r.ir_contrast)+.5);let b,x,S;if(r.variant<.5)b=y*.985,x=y,S=y*1.02;else if(r.variant<1.5){let e=y**.92;b=l(.015,.9,e),x=l(.06,.985,e),S=l(.1,1,e)}else{let e=l(.03,.93,y),t=l(.09,.92,y),n=l(.15,.96,y),r=l(.5,1,y),i=l(.1,.74,y),a=l(.32,.86,y),o=l(0,.06,y),s=l(.06,.32,y),c=l(.11,.4,y);b=l(e,r,_*.95),x=l(t,i,_*.95),S=l(n,a,_*.95),b=l(b,o,v*.9),x=l(x,s,v*.9),S=l(S,c,v*.9)}i[a]=b,i[a+1]=x,i[a+2]=S}function h(e){return e<.5?[1,1,1]:e<1.5?[.85,.97,1]:[1,.85,.95]}function g(e,t,n,r){let i=t*e.w-.5,a=n*e.h-.5,o=Math.floor(i),s=Math.floor(a),c=i-o,u=a-s,d=Math.min(e.w-1,Math.max(0,o)),f=Math.min(e.w-1,Math.max(0,o+1)),p=Math.min(e.h-1,Math.max(0,s)),m=Math.min(e.h-1,Math.max(0,s+1));for(let t=0;t<3;t++){let n=e.d[(p*e.w+d)*3+t],i=e.d[(p*e.w+f)*3+t],a=e.d[(m*e.w+d)*3+t],o=e.d[(m*e.w+f)*3+t];r[t]=l(l(n,i,c),l(a,o,c),u)}}var _=[.227027,.1945946,.1216216,.054054,.016216];function v(e,t,n){let r={d:new Float32Array(e.d.length),w:e.w,h:e.h},i=new Float32Array(3);for(let a=0;a<e.h;a++)for(let o=0;o<e.w;o++){let s=(o+.5)/e.w,c=(a+.5)/e.h,l=[0,0,0];for(let r=0;r<5;r++){let a=r===0?[0]:[r,-r];for(let o of a){g(e,s+t*o,c+n*o,i);for(let e=0;e<3;e++)l[e]+=i[e]*_[r]}}let u=(a*e.w+o)*3;r.d[u]=l[0],r.d[u+1]=l[1],r.d[u+2]=l[2]}return r}function y(e,t,n,r){let i=new Uint8ClampedArray(e.length),u=new Float32Array(3),d=r.bloom>1e-4,f=null;if(d){let i=Math.max(1,Math.round(t*.25)),c=Math.max(1,Math.round(n*.25)),l={d:new Float32Array(i*c*3),w:i,h:c},d=(r,i,a)=>e[(Math.min(n-1,Math.max(0,i))*t+Math.min(t-1,Math.max(0,r)))*4+a]/255;for(let e=0;e<c;e++)for(let t=0;t<i;t++){let n=[0,0,0];for(let[i,a]of[[0,0],[2,0],[0,2],[2,2]]){let o=t*4+i-0,s=e*4+a-0;m((d(o,s,0)+d(o+1,s,0)+d(o,s+1,0)+d(o+1,s+1,0))/4,(d(o,s,1)+d(o+1,s,1)+d(o,s+1,1)+d(o+1,s+1,1))/4,(d(o,s,2)+d(o+1,s,2)+d(o,s+1,2)+d(o+1,s+1,2))/4,r,u),n[0]+=u[0]/4,n[1]+=u[1]/4,n[2]+=u[2]/4}let a=(e*i+t)*3;for(let e=0;e<3;e++)l.d[a+e]=Math.min(1,Math.max(0,n[e]-o)*s)}let p=Math.max(t,n);l=v(l,a*p/t,0),l=v(l,0,a*p/n),f=l}let p=h(r.variant),_=new Float32Array(3);for(let a=0;a<n;a++)for(let o=0;o<t;o++){let s=(a*t+o)*4,d=e[s]/255,h=e[s+1]/255,v=e[s+2]/255;m(d,h,v,r,u);let y=u[0],b=u[1],x=u[2];f&&(g(f,(o+.5)/t,(a+.5)/n,_),y+=_[0]*r.bloom*p[0],b+=_[1]*r.bloom*p[1],x+=_[2]*r.bloom*p[2]),y=c(y),b=c(b),x=c(x),i[s]=Math.round(l(d,y,r.intensity)*255),i[s+1]=Math.round(l(h,b,r.intensity)*255),i[s+2]=Math.round(l(v,x,r.intensity)*255),i[s+3]=255}return i}var b=e+t,x=e+r,S={id:`ghost_ir`,name:`GHOST IR`,blurb:`Fałszywa podczerwień: biała roślinność, ciemne niebo.`,params:i,uniforms:e=>({u_foliage:e.foliage_white,u_sky:e.sky_darkness,u_contrast:e.ir_contrast,u_variant:e.variant,u_bloom:e.bloom,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let r=Math.max(e,t);return[{frag:b,scale:.25,inputs:[`src`]},{frag:n,scale:.25,inputs:[0],uniforms:{u_dir:[a*r/e,0]}},{frag:n,scale:.25,inputs:[1],uniforms:{u_dir:[0,a*r/t]}},{frag:x,scale:1,inputs:[`src`,2]}]},cpu:y},C=`// AZURE: film z zamienionymi warstwami barwnymi R<->B (niebo -> pomarańcz/róż, czerwień -> fiolet/błękit,
// żółć -> azur, skóra -> błękit), mocny kontrast, różowe światła, zielonkawe ziarniste cienie, niebieska halacja.
uniform sampler2D u_in0;
uniform vec2 u_grid;   // komórki ziarna na obraz (niezależne od rozdzielczości)
uniform vec2 u_ring;   // long/width, long/height
uniform float u_swap, u_fol, u_shadow, u_high, u_mut, u_grain, u_hal, u_intensity;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  float y0 = dot(c0, LUMA);
  vec3 c = mix(c0, c0.bgr, u_swap);
  float fol = smoothstep(0.02, 0.25, c.g - max(c.r, c.b));
  c.b += fol * u_fol * 0.45 * c.g;
  c.r *= 1.0 - 0.4 * fol * u_fol;
  float y = dot(c, LUMA);
  c = clamp(mix(vec3(y), c, 1.25), 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
  y = dot(c, LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.4, y);
  c += sh * u_shadow * vec3(-0.03, 0.07, 0.02);
  float hl = smoothstep(0.6, 1.0, y);
  c = mix(c, c * vec3(1.05, 0.86, 0.98) + vec3(0.03, 0.0, 0.02), hl * u_high);
  vec3 drift = vec3(vnoise(v_uv * 2.5 + vec2(3.0, 1.0)), vnoise(v_uv * 2.5 + vec2(17.0, 5.0)), vnoise(v_uv * 2.5 + vec2(9.0, 23.0))) - 0.5;
  c += drift * 0.25 * u_mut;
  if (u_hal > 0.001) {
    float acc = 0.0;
    for (int r = 0; r < 2; r++) {
      float rad = r == 0 ? 0.008 : 0.02;
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.785398163;
        vec3 s = texture(u_in0, v_uv + vec2(cos(a), sin(a)) * rad * u_ring).rgb;
        acc += smoothstep(0.7, 0.95, dot(s, LUMA));
      }
    }
    float halo = (acc / 16.0) * (1.0 - smoothstep(0.7, 0.95, y0));
    c += vec3(0.12, 0.40, 1.0) * halo * u_hal * 0.9;
  }
  vec2 cell = floor(v_uv * u_grid);
  float g = hash2(cell) - 0.5;
  float gg = hash2(cell + vec2(31.0, 57.0)) - 0.5;
  float amp = u_grain * (0.06 + 0.16 * sh);
  c += g * amp * 0.9;
  c.g += gg * amp * sh;
  o_color = vec4(mix(c0, clamp(c, 0.0, 1.0), u_intensity), 1.0);
}
`;function w(e,t,n,r){let i=new Uint8ClampedArray(e.length),a=[0,0,0];for(let o=0;o<n;o++)for(let n=0;n<t;n++){let s=(o*t+n)*4;r(e[s]/255,e[s+1]/255,e[s+2]/255,n,o,a),i[s]=Math.round(a[0]*255),i[s+1]=Math.round(a[1]*255),i[s+2]=Math.round(a[2]*255),i[s+3]=255}return i}function T(e,t){let n=Math.imul(e,374761393)+Math.imul(t,668265263)>>>0;return n=Math.imul(n^n>>>13,1274126177)>>>0,n=(n^n>>>16)>>>0,n/4294967295}function E(e,t){let n=Math.floor(e),r=Math.floor(t),i=e-n,a=t-r,o=i*i*(3-2*i),s=a*a*(3-2*a),c=T(n,r),l=T(n+1,r),u=T(n,r+1),d=T(n+1,r+1);return c+(l-c)*o+(u+(d-u)*o-(c+(l-c)*o))*s}function D(e,t,n){let r=(r,i,a)=>e[(Math.min(n-1,Math.max(0,i))*t+Math.min(t-1,Math.max(0,r)))*4+a]/255;return(e,i,a)=>{let o=e*t-.5,s=i*n-.5,c=Math.floor(o),l=Math.floor(s),u=o-c,d=s-l,f=r(c,l,a)+(r(c+1,l,a)-r(c,l,a))*u;return f+(r(c,l+1,a)+(r(c+1,l+1,a)-r(c,l+1,a))*u-f)*d}}var O=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),k=[O(`sky_shift`,`COLOR SWAP`,.9),O(`foliage_cyan`,`FOLIAGE CYAN`,.5),O(`shadow_tint`,`SHADOW TINT`,.5),O(`highlight_pink`,`HIGHLIGHT PINK`,.6),O(`mutation`,`MUTATION`,.3),O(`grain`,`GRAIN`,.4),O(`halation`,`HALATION`,.4),O(`intensity`,`INTENSITY`,1)],A=1e3,j=e=>e[0]*.2126+e[1]*.7152+e[2]*.0722,M=(e,t)=>l(e,e*e*(3-2*e),t);function N(e,t,n,r){let i=Math.max(t,n),a=i/t,o=i/n,s=A*t/i,d=A*n/i,f=D(e,t,n);return w(e,t,n,(e,i,p,m,h,g)=>{let _=(m+.5)/t,v=(h+.5)/n,y=j([e,i,p]),b=[l(e,p,r.sky_shift),i,l(p,e,r.sky_shift)],x=u(.02,.25,b[1]-Math.max(b[0],b[2]));b[2]+=x*r.foliage_cyan*.45*b[1],b[0]*=1-.4*x*r.foliage_cyan;let S=j(b);b=b.map(e=>c(l(S,e,1.25))),b=b.map(e=>M(e,.55)),S=j(b);let C=1-u(0,.4,S);b=[b[0]+C*r.shadow_tint*-.03,b[1]+C*r.shadow_tint*.07,b[2]+C*r.shadow_tint*.02];let w=u(.6,1,S)*r.highlight_pink;b=[l(b[0],b[0]*1.05+.03,w),l(b[1],b[1]*.86,w),l(b[2],b[2]*.98+.02,w)];let D=[E(_*2.5+3,v*2.5+1),E(_*2.5+17,v*2.5+5),E(_*2.5+9,v*2.5+23)];if(b=b.map((e,t)=>e+(D[t]-.5)*.25*r.mutation),r.halation>.001){let e=0;for(let t of[.008,.02])for(let n=0;n<8;n++){let r=n*.785398163,i=_+Math.cos(r)*t*a,s=v+Math.sin(r)*t*o;e+=u(.7,.95,j([f(i,s,0),f(i,s,1),f(i,s,2)]))}let t=e/16*(1-u(.7,.95,y))*r.halation*.9;b=[b[0]+.12*t,b[1]+.4*t,b[2]+1*t]}let O=Math.floor(_*s),k=Math.floor(v*d),A=T(O,k)-.5,N=T(O+31,k+57)-.5,P=r.grain*(.06+.16*C);b=b.map(e=>e+A*P*.9),b[1]+=N*P*C;let ee=[e,i,p];for(let e=0;e<3;e++)g[e]=l(ee[e],c(b[e]),r.intensity)})}var P={id:`azure`,name:`AZURE`,blurb:`Film z zamienionymi warstwami barwnymi: pomarańczowe niebo, niebieska skóra, różowe światła.`,params:k,uniforms:e=>({u_swap:e.sky_shift,u_fol:e.foliage_cyan,u_shadow:e.shadow_tint,u_high:e.highlight_pink,u_mut:e.mutation,u_grain:e.grain,u_hal:e.halation,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:C,scale:1,inputs:[`src`],uniforms:{u_grid:[A*e/n,A*t/n],u_ring:[n/e,n/t]}}]},cpu:N},ee=`// BROKEN RGB: niezależne próbkowanie kanałów z przesunięciem + zamiana kanałów.
uniform sampler2D u_in0;
uniform vec3 u_off;     // R,G,B offset (-1..1)
uniform vec2 u_shift;   // UV dla offsetu 1.0 (3% dłuższego boku)
uniform float u_swap, u_intensity;
void main() {
  vec3 c = texture(u_in0, v_uv).rgb;
  float r = texture(u_in0, v_uv + vec2(1.0, 0.3) * u_off.x * u_shift).r;
  float g = texture(u_in0, v_uv + vec2(-0.3, 1.0) * u_off.y * u_shift).g;
  float b = texture(u_in0, v_uv + vec2(-1.0, -0.3) * u_off.z * u_shift).b;
  vec3 o = vec3(r, g, b);
  if (u_swap > 3.5) o = o.gbr;
  else if (u_swap > 2.5) o = o.rbg;
  else if (u_swap > 1.5) o = o.grb;
  else if (u_swap > 0.5) o = o.bgr;
  o_color = vec4(mix(c, o, u_intensity), 1.0);
}
`,te=(e,t,n)=>({kind:`number`,id:e,label:t,min:-1,max:1,step:.01,default:n}),ne=[{kind:`enum`,id:`channel_swap`,label:`CHANNEL SWAP`,default:0,options:[{value:0,label:`OFF`},{value:1,label:`R↔B`},{value:2,label:`R↔G`},{value:3,label:`G↔B`},{value:4,label:`ROT`}]},te(`red_offset`,`RED OFFSET`,.5),te(`green_offset`,`GREEN OFFSET`,0),te(`blue_offset`,`BLUE OFFSET`,.5),{kind:`number`,id:`intensity`,label:`INTENSITY`,min:0,max:1,step:.01,default:1}],re=.03,ie=[[1,.3],[-.3,1],[-1,-.3]];function ae(e,t){let[n,r,i]=e;return t>3.5?[r,i,n]:t>2.5?[n,i,r]:t>1.5?[r,n,i]:t>.5?[i,r,n]:[n,r,i]}function oe(e,t,n,r){let i=Math.max(t,n),a=re*i/t,o=re*i/n,s=[r.red_offset,r.green_offset,r.blue_offset],c=(r,i,a)=>e[(Math.min(n-1,Math.max(0,i))*t+Math.min(t-1,Math.max(0,r)))*4+a]/255,u=(e,r,i)=>{let a=e*t-.5,o=r*n-.5,s=Math.floor(a),u=Math.floor(o),d=a-s,f=o-u;return l(l(c(s,u,i),c(s+1,u,i),d),l(c(s,u+1,i),c(s+1,u+1,i),d),f)};return w(e,t,n,(e,i,c,d,f,p)=>{let m=(d+.5)/t,h=(f+.5)/n,g=ae([0,1,2].map(e=>u(m+ie[e][0]*s[e]*a,h+ie[e][1]*s[e]*o,e)),r.channel_swap);p[0]=l(e,g[0],r.intensity),p[1]=l(i,g[1],r.intensity),p[2]=l(c,g[2],r.intensity)})}var se={id:`broken_rgb`,name:`BROKEN RGB`,blurb:`Rozdzielone kanały: duchy R/G/B, aberracje, zamiana kanałów.`,params:ne,uniforms:e=>({u_off:[e.red_offset,e.green_offset,e.blue_offset],u_swap:e.channel_swap,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:ee,scale:1,inputs:[`src`],uniforms:{u_shift:[re*n/e,re*n/t]}}]},cpu:oe},ce=`// CYANOTYPE: luminancja -> dwukolorowa mapa tonalna (błękit pruski / biel papieru) + tekstura papieru.
uniform sampler2D u_in0;
uniform vec2 u_grid;    // liczba komórek ziarna na obraz (niezależna od rozdzielczości)
uniform float u_depth, u_paper, u_contrast, u_texture, u_intensity;
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
void main() {
  vec3 c = texture(u_in0, v_uv).rgb;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float n = hash2(floor(v_uv * u_grid)) - 0.5;
  float n2 = hash2(floor(v_uv * u_grid * 0.25) + vec2(7.0, 13.0)) - 0.5;
  y = clamp(y + (n * 0.10 + n2 * 0.16) * u_texture, 0.0, 1.0);
  y = mix(y, y * y * (3.0 - 2.0 * y), u_contrast);
  y = clamp((y - 0.5) * (1.0 + 0.5 * u_contrast) + 0.5, 0.0, 1.0);
  y = pow(y, mix(0.75, 1.7, u_depth));
  vec3 deep = vec3(0.015, 0.055, 0.17);
  vec3 mid = vec3(0.06, 0.30, 0.52);
  vec3 paper = mix(vec3(0.80, 0.90, 0.90), vec3(0.97, 0.995, 0.98), u_paper);
  vec3 col = mix(mix(deep, mid, smoothstep(0.0, 0.5, y)), paper, smoothstep(0.45, 1.0, y));
  o_color = vec4(mix(c, col, u_intensity), 1.0);
}
`,le=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),ue=[le(`blue_depth`,`BLUE DEPTH`,.5),le(`paper_white`,`PAPER WHITE`,.6),le(`contrast`,`CONTRAST`,.4),le(`texture`,`TEXTURE`,.35),le(`intensity`,`INTENSITY`,1)],de=1200,fe=[.015,.055,.17],pe=[.06,.3,.52];function me(e,t,n,r){let i=Math.max(t,n),a=de*t/i,o=de*n/i,s=[l(.8,.97,r.paper_white),l(.9,.995,r.paper_white),l(.9,.98,r.paper_white)];return w(e,t,n,(e,i,d,f,p,m)=>{let h=(f+.5)/t,g=(p+.5)/n,_=e*.2126+i*.7152+d*.0722,v=T(Math.floor(h*a),Math.floor(g*o))-.5,y=T(Math.floor(h*a*.25)+7,Math.floor(g*o*.25)+13)-.5;_=c(_+(v*.1+y*.16)*r.texture),_=l(_,_*_*(3-2*_),r.contrast),_=c((_-.5)*(1+.5*r.contrast)+.5),_**=+l(.75,1.7,r.blue_depth);let b=u(0,.5,_),x=u(.45,1,_),S=[0,1,2].map(e=>l(l(fe[e],pe[e],b),s[e],x));m[0]=l(e,S[0],r.intensity),m[1]=l(i,S[1],r.intensity),m[2]=l(d,S[2],r.intensity)})}var he={id:`cyanotype`,name:`CYANOTYPE`,blurb:`Cyfrowa cyjanotypia: błękit pruski i biel papieru.`,params:ue,uniforms:e=>({u_depth:e.blue_depth,u_paper:e.paper_white,u_contrast:e.contrast,u_texture:e.texture,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:ce,scale:1,inputs:[`src`],uniforms:{u_grid:[de*e/n,de*t/n]}}]},cpu:me},ge=`// CHROME METROPOLIS: przygaszone kolory, mocny kontrast, turkusowe cienie, brzoskwiniowe światła, zieleń -> ciemny turkus/oliwka.
uniform sampler2D u_in0;
uniform vec2 u_grid;
uniform float u_sat, u_contrast, u_teal, u_peach, u_green, u_fade, u_grain, u_intensity;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  vec3 c = c0;
  float gd = smoothstep(0.02, 0.20, c.g - max(c.r, c.b));
  float bd = smoothstep(0.02, 0.20, c.b - c.r);
  float y = dot(c, LUMA);
  c = mix(vec3(y), c, mix(0.25, 1.0, u_sat) * (1.0 - 0.35 * gd));
  c.r *= 1.0 - 0.30 * gd * u_green;
  c.b += gd * 0.25 * u_green * c.g;
  c.g = mix(c.g, c.b * 0.85, bd * 0.35);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  c = clamp((c - 0.5) * (1.0 + 0.3 * u_contrast) + 0.5, 0.0, 1.0);
  y = dot(c, LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.45, y);
  c = mix(c, c * vec3(0.78, 1.0, 1.02) + vec3(-0.01, 0.025, 0.03), sh * u_teal);
  float hl = smoothstep(0.55, 1.0, y);
  c = mix(c, c * vec3(1.04, 0.96, 0.90) + vec3(0.02, 0.005, 0.0), hl * u_peach);
  c = c * (1.0 - 0.1 * u_fade) + 0.04 * u_fade;
  float g = hash2(floor(v_uv * u_grid)) - 0.5;
  c += g * u_grain * (0.05 + 0.13 * sh);
  o_color = vec4(mix(c0, clamp(c, 0.0, 1.0), u_intensity), 1.0);
}
`,F=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),_e=[F(`saturation`,`SATURATION`,.45),F(`contrast`,`CONTRAST`,.6),F(`teal_shadows`,`TEAL SHADOWS`,.6),F(`peach_highlights`,`PEACH HIGHLIGHTS`,.5),F(`green_to_teal`,`GREEN TO TEAL`,.5),F(`fade`,`FADE`,.2),F(`grain`,`GRAIN`,.35),F(`intensity`,`INTENSITY`,1)],ve=1e3,ye=e=>e[0]*.2126+e[1]*.7152+e[2]*.0722,be=(e,t)=>l(e,e*e*(3-2*e),t);function xe(e,t,n,r){let i=Math.max(t,n),a=ve*t/i,o=ve*n/i;return w(e,t,n,(e,i,s,d,f,p)=>{let m=(d+.5)/t,h=(f+.5)/n,g=u(.02,.2,i-Math.max(e,s)),_=u(.02,.2,s-e),v=ye([e,i,s]),y=l(.25,1,r.saturation)*(1-.35*g),b=[l(v,e,y),l(v,i,y),l(v,s,y)];b[0]*=1-.3*g*r.green_to_teal,b[2]+=g*.25*r.green_to_teal*b[1],b[1]=l(b[1],b[2]*.85,_*.35),b=b.map(e=>c(c(be(c(e),r.contrast)-.5+.5))),b=b.map(e=>c((e-.5)*(1+.3*r.contrast)+.5));let x=ye(b),S=1-u(0,.45,x),C=S*r.teal_shadows;b=[l(b[0],b[0]*.78-.01,C),l(b[1],b[1]+.025,C),l(b[2],b[2]*1.02+.03,C)];let w=u(.55,1,x)*r.peach_highlights;b=[l(b[0],b[0]*1.04+.02,w),l(b[1],b[1]*.96+.005,w),l(b[2],b[2]*.9,w)],b=b.map(e=>e*(1-.1*r.fade)+.04*r.fade);let E=T(Math.floor(m*a),Math.floor(h*o))-.5;b=b.map(e=>e+E*r.grain*(.05+.13*S));let D=[e,i,s];for(let e=0;e<3;e++)p[e]=l(D[e],c(b[e]),r.intensity)})}var Se={id:`chrome_metropolis`,name:`CHROME METROPOLIS`,blurb:`Miejski, przygaszony film: turkusowe cienie, brzoskwiniowe światła, ciemna zieleń.`,params:_e,uniforms:e=>({u_sat:e.saturation,u_contrast:e.contrast,u_teal:e.teal_shadows,u_peach:e.peach_highlights,u_green:e.green_to_teal,u_fade:e.fade,u_grain:e.grain,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:ge,scale:1,inputs:[`src`],uniforms:{u_grid:[ve*e/n,ve*t/n]}}]},cpu:xe},Ce=`// CINESTILL 800T: film tungstenowy (niebieski w dziennym świetle), miękkie światła, turkusowe cienie,
// czerwono-pomarańczowa halacja wokół jasnych źródeł (brak warstwy remjet), drobne ziarno.
uniform sampler2D u_in0;
uniform sampler2D u_in1; // rozmyta maska jasnych źródeł (1/4 rozdzielczości)
uniform vec2 u_grid;
uniform float u_cast, u_roll, u_teal, u_contrast, u_sat, u_hal, u_grain, u_intensity;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  float y0 = dot(c0, LUMA);
  vec3 c = c0 * mix(vec3(1.0), vec3(0.80, 0.98, 1.28), u_cast);
  float a = 0.6 * u_roll;
  c = c * (1.0 + a) / (1.0 + a * c);   // miękkie światła (rolloff), f(1)=1
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast * 0.8);
  float y = dot(c, LUMA);
  c = mix(vec3(y), c, mix(0.6, 1.5, u_sat));
  float sh = 1.0 - smoothstep(0.0, 0.45, y);
  c = mix(c, c * vec3(0.80, 1.0, 1.10) + vec3(0.0, 0.02, 0.04), sh * u_teal);
  float halo = sqrt(texture(u_in1, v_uv).r) * (1.0 - 0.6 * smoothstep(0.75, 0.97, y0));
  c += vec3(1.0, 0.28, 0.08) * halo * u_hal * 0.9;
  float g = hash2(floor(v_uv * u_grid)) - 0.5;
  c += g * u_grain * (0.04 + 0.08 * sh);
  o_color = vec4(mix(c0, clamp(c, 0.0, 1.0), u_intensity), 1.0);
}
`,we=`// CINESTILL pass 1: maska jasnych źródeł światła w 1/4 rozdzielczości (box 4x4 w 4 próbkach dwuliniowych).
uniform sampler2D u_in0;
uniform vec2 u_srcTexel;
float m(vec2 uv) { return smoothstep(0.75, 0.97, dot(texture(u_in0, uv).rgb, vec3(0.2126, 0.7152, 0.0722))); }
void main() {
  float a = m(v_uv + u_srcTexel * vec2(-1.0, -1.0));
  float b = m(v_uv + u_srcTexel * vec2( 1.0, -1.0));
  float c = m(v_uv + u_srcTexel * vec2(-1.0,  1.0));
  float d = m(v_uv + u_srcTexel * vec2( 1.0,  1.0));
  o_color = vec4(vec3((a + b + c + d) * 0.25), 1.0);
}
`,I=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),Te=[I(`tungsten_cast`,`TUNGSTEN BLUE`,.5),I(`highlight_rolloff`,`HIGHLIGHT ROLLOFF`,.5),I(`teal_shadows`,`TEAL SHADOWS`,.5),I(`contrast`,`CONTRAST`,.4),I(`saturation`,`SATURATION`,.5),I(`halation`,`HALATION`,.6),I(`grain`,`GRAIN`,.3),I(`intensity`,`INTENSITY`,1)],Ee=1e3,De=.012,Oe=e=>e[0]*.2126+e[1]*.7152+e[2]*.0722;function ke(e,t,n,r){let i=Math.max(t,n),a=Ee*t/i,o=Ee*n/i,s=.6*r.highlight_rolloff,d=null;if(r.halation>.001){let r=Math.max(1,Math.round(t*.25)),a=Math.max(1,Math.round(n*.25)),o={d:new Float32Array(r*a*3),w:r,h:a},s=(r,i,a)=>e[(Math.min(n-1,Math.max(0,i))*t+Math.min(t-1,Math.max(0,r)))*4+a]/255;for(let e=0;e<a;e++)for(let t=0;t<r;t++){let n=0;for(let[r,i]of[[0,0],[2,0],[0,2],[2,2]]){let a=t*4+r,o=e*4+i,c=e=>(s(a,o,e)+s(a+1,o,e)+s(a,o+1,e)+s(a+1,o+1,e))/4;n+=u(.75,.97,Oe([c(0),c(1),c(2)]))/4}let i=(e*r+t)*3;o.d[i]=n,o.d[i+1]=n,o.d[i+2]=n}o=v(o,De*i/t,0),o=v(o,0,De*i/n),d=o}let f=[l(1,.8,r.tungsten_cast),l(1,.98,r.tungsten_cast),l(1,1.28,r.tungsten_cast)],p=new Float32Array(3);return w(e,t,n,(e,i,m,h,_,v)=>{let y=(h+.5)/t,b=(_+.5)/n,x=Oe([e,i,m]),S=[e*f[0],i*f[1],m*f[2]].map(e=>e*(1+s)/(1+s*e));S=S.map(e=>l(e,e*e*(3-2*e),r.contrast*.8));let C=Oe(S),w=l(.6,1.5,r.saturation);S=S.map(e=>l(C,e,w));let E=1-u(0,.45,C),D=E*r.teal_shadows;if(S=[l(S[0],S[0]*.8,D),l(S[1],S[1]+.02,D),l(S[2],S[2]*1.1+.04,D)],d){g(d,y,b,p);let e=Math.sqrt(p[0])*(1-.6*u(.75,.97,x))*r.halation*.9;S=[S[0]+1*e,S[1]+.28*e,S[2]+.08*e]}let O=T(Math.floor(y*a),Math.floor(b*o))-.5;S=S.map(e=>e+O*r.grain*(.04+.08*E));let k=[e,i,m];for(let e=0;e<3;e++)v[e]=l(k[e],c(S[e]),r.intensity)})}var Ae={id:`cinestill_800t`,name:`CINESTILL 800T`,blurb:`Film tungstenowy: niebieski dzień, turkusowe cienie, czerwona halacja wokół świateł.`,params:Te,uniforms:e=>({u_cast:e.tungsten_cast,u_roll:e.highlight_rolloff,u_teal:e.teal_shadows,u_contrast:e.contrast,u_sat:e.saturation,u_hal:e.halation,u_grain:e.grain,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let r=Math.max(e,t);return[{frag:we,scale:.25,inputs:[`src`]},{frag:n,scale:.25,inputs:[0],uniforms:{u_dir:[De*r/e,0]}},{frag:n,scale:.25,inputs:[1],uniforms:{u_dir:[0,De*r/t]}},{frag:Ce,scale:1,inputs:[`src`,2],uniforms:{u_grid:[Ee*e/r,Ee*t/r]}}]},cpu:ke},je=`uniform sampler2D u_in0;
void main() {
  o_color = vec4(texture(u_in0, v_uv).rgb, 1.0);
}
`,Me={id:`double_exposure`,stage:`compose`,name:`DOUBLE EXPOSURE`,blurb:`Dwie klatki na jednym negatywie. Wczytaj klatkę B, potem użyj dowolnego efektu na wyniku.`,params:[{kind:`enum`,id:`mode`,label:`TRYB`,default:0,options:[{value:0,label:`SCREEN`},{value:1,label:`ADD`},{value:2,label:`LIGHTEN`},{value:3,label:`DARKEN`},{value:4,label:`MULTIPLY`},{value:5,label:`OVERLAY`},{value:6,label:`NORMAL`},{value:7,label:`DIFF`}]},{kind:`number`,id:`blend`,label:`BLEND`,min:0,max:1,step:.01,default:.7},{kind:`number`,id:`shadow_mask`,label:`SHADOW MASK`,min:0,max:1,step:.01,default:.4},{kind:`number`,id:`contrast`,label:`KONTRAST B`,min:0,max:1,step:.01,default:.3},{kind:`number`,id:`mono`,label:`MONO B`,min:0,max:1,step:.01,default:0},{kind:`number`,id:`scale`,label:`SKALA B`,min:.4,max:3,step:.01,default:1},{kind:`number`,id:`pos_x`,label:`POZYCJA X`,min:-.5,max:.5,step:.005,default:0},{kind:`number`,id:`pos_y`,label:`POZYCJA Y`,min:-.5,max:.5,step:.005,default:0},{kind:`number`,id:`rotate`,label:`OBRÓT B °`,min:-.5,max:.5,step:.0025,default:0,displayScale:360},{kind:`enum`,id:`mirror`,label:`ODBICIE B`,default:0,options:[{value:0,label:`OFF`},{value:1,label:`ON`}]},{kind:`enum`,id:`invert`,label:`NEGATYW B`,default:0,options:[{value:0,label:`OFF`},{value:1,label:`ON`}]}],uniforms(e){return{u_mode:e.mode,u_blend:e.blend,u_mask:e.shadow_mask,u_scale:e.scale,u_posx:e.pos_x,u_posy:e.pos_y,u_rot:e.rotate*Math.PI*2,u_mirror:e.mirror,u_invert:e.invert,u_contrast:e.contrast,u_mono:e.mono}},passes:()=>[{frag:je,scale:1,inputs:[`src`]}],cpu:e=>new Uint8ClampedArray(e)},Ne=`// GLITCH: cyfrowe uszkodzenie układu obrazu — pasy, przesunięte bloki, rozjazd kanałów, scanlines. Deterministyczne (seed).
uniform sampler2D u_in0;
uniform vec2 u_grid;   // komórki szumu na obraz (niezależne od rozdzielczości)
uniform float u_damage, u_block, u_scan, u_disp, u_rand, u_seed;
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
float hs(vec2 p) { return hash2(p + vec2(u_seed * 37.0, u_seed * 91.0)); }
vec3 tap(vec2 uv, float dx) { return texture(u_in0, vec2(fract(uv.x + dx), clamp(uv.y, 0.0, 1.0))).rgb; }
void main() {
  vec2 uv = v_uv;
  // poziome pasy: część z nich jest przesunięta w bok (z zawinięciem)
  float rows = mix(90.0, 8.0, u_block);
  float row = floor(uv.y * rows);
  float act = step(1.0 - 0.7 * u_damage, hs(vec2(row, 3.0)));
  float amp = mix(1.0, hs(vec2(row, 17.0)), u_rand);
  float dir = hs(vec2(row, 29.0)) - 0.5;
  uv.x += dir * 2.0 * u_disp * 0.25 * amp * act;
  // bloki: lokalne przesunięcia UV i uszkodzenia kolorów
  vec2 grid = vec2(mix(40.0, 6.0, u_block), mix(30.0, 4.0, u_block));
  vec2 cell = floor(vec2(fract(uv.x), clamp(uv.y, 0.0, 0.9999)) * grid);
  float cf = step(1.0 - 0.3 * u_damage, hs(cell + vec2(200.0, 50.0)));
  vec2 bo = (vec2(hs(cell + vec2(7.0, 300.0)), hs(cell + vec2(9.0, 400.0))) - 0.5) * 2.0 * u_disp * 0.06 * cf;
  uv += bo;
  float sp = u_disp * 0.015 * (act * amp + cf);
  vec3 c = vec3(tap(uv, sp).r, tap(uv, 0.0).g, tap(uv, -sp).b);
  float ch = hs(cell + vec2(11.0, 500.0));
  vec3 alt = ch < 0.33 ? c.gbr : (ch < 0.66 ? c.brg : 1.0 - c);
  c = mix(c, alt, cf * (0.4 + 0.6 * u_damage));
  // scanlines: stała liczba linii na wysokość obrazu (podgląd = eksport)
  float sl = 0.5 + 0.5 * cos(v_uv.y * 540.0 * 6.2831853);
  c *= 1.0 - u_scan * 0.45 * sl;
  // cyfrowy szum, mocniejszy w uszkodzonych pasach
  float n = hash2(floor(v_uv * u_grid) + vec2(u_seed * 13.0, 700.0)) - 0.5;
  c += n * u_damage * 0.3 * (0.12 + act + cf);
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,Pe=`// UNSTABLE FILM: kontrolowana mutacja (dominanta, kontrast, nasycenie, przesunięcie kanałów, lokalne błędy, ziarno). Z seeda.
uniform sampler2D u_in0;
uniform vec2 u_grid;
uniform float u_stab, u_drift, u_damage, u_rand, u_seed;
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
float hk(float k) { return hash2(vec2(u_seed * 7.0 + 1.0, k * 31.0 + 5.0)); }
float hs(vec2 p) { return hash2(p + vec2(u_seed * 37.0, u_seed * 91.0)); }
void main() {
  float A = (1.0 - u_stab) * (0.4 + 0.6 * u_rand);
  vec3 tint = (vec3(hk(1.0), hk(2.0), hk(3.0)) - 0.5) * 2.0 * u_drift * A * 0.3;
  float kc = (hk(4.0) - 0.5) * 2.0 * A * 0.6;
  float sat = 1.0 + (hk(5.0) - 0.5) * 2.0 * A * 0.7;
  vec2 sh = (vec2(hk(6.0), hk(7.0)) - 0.5) * 2.0 * A * 0.012 * u_drift;
  float hl = 1.0 + (hk(8.0) - 0.5) * 0.4 * A;
  vec3 c = vec3(texture(u_in0, v_uv + sh).r, texture(u_in0, v_uv).g, texture(u_in0, v_uv - sh).b);
  // lokalne błędy: bloki z zamienionymi kanałami i pojedyncze jasne linie
  vec2 cell = floor(v_uv * vec2(14.0, 10.0));
  float ef = step(1.0 - 0.22 * u_damage, hs(cell));
  c = mix(c, c.bgr * vec3(1.1, 0.9, 1.0), 0.6 * ef);
  float row = floor(v_uv.y * 120.0);
  float rf = step(1.0 - 0.05 * u_damage, hs(vec2(row, 900.0)));
  c += rf * 0.15 * (hs(vec2(row, 901.0)) - 0.3);
  // globalna mutacja
  c *= 1.0 + tint;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(y), c, sat);
  c = (kc >= 0.0) ? mix(c, c * c * (3.0 - 2.0 * c), kc) : (c - 0.5) * (1.0 + kc) + 0.5;
  c *= mix(1.0, hl, smoothstep(0.5, 1.0, y));
  float g = hash2(floor(v_uv * u_grid) + vec2(u_seed * 5.0, 1300.0)) - 0.5;
  c += g * 0.1 * (0.4 + A);
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,L=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),Fe=e=>({kind:`number`,id:`seed`,label:`SEED`,min:0,max:9999,step:1,default:e,displayScale:1}),R=320,Ie=(e,t)=>t<e?0:1,Le=e=>e-Math.floor(e),Re=[L(`damage`,`DAMAGE`,.5),L(`block_size`,`BLOCK SIZE`,.4),L(`scanlines`,`SCANLINES`,.3),L(`displacement`,`DISPLACEMENT`,.5),L(`randomness`,`RANDOMNESS`,.5),Fe(7)];function ze(e,t,n,r){let i=D(e,t,n),a=Math.max(t,n),o=R*t/a,s=R*n/a,u=(e,t)=>T(Math.floor(e+r.seed*37),Math.floor(t+r.seed*91));return w(e,t,n,(e,a,d,f,p,m)=>{let h=(f+.5)/t,g=(p+.5)/n,_=h,v=l(90,8,r.block_size),y=Math.floor(g*v),b=Ie(1-.7*r.damage,u(y,3)),x=l(1,u(y,17),r.randomness),S=u(y,29)-.5;_+=S*2*r.displacement*.25*x*b;let C=l(40,6,r.block_size),w=l(30,4,r.block_size),E=Math.floor(Le(_)*C),D=Math.floor(Math.min(Math.max(g,0),.9999)*w),O=Ie(1-.3*r.damage,u(E+200,D+50));_+=(u(E+7,D+300)-.5)*2*r.displacement*.06*O;let k=Math.min(Math.max(g+(u(E+9,D+400)-.5)*2*r.displacement*.06*O,0),1),A=r.displacement*.015*(b*x+O),j=(e,t)=>i(Le(_+e),k,t),M=[j(A,0),j(0,1),j(-A,2)],N=u(E+11,D+500),P=N<.33?[M[1],M[2],M[0]]:N<.66?[M[2],M[0],M[1]]:M.map(e=>1-e),ee=O*(.4+.6*r.damage);M=M.map((e,t)=>l(e,P[t],ee));let te=.5+.5*Math.cos(g*540*6.2831853);M=M.map(e=>e*(1-r.scanlines*.45*te));let ne=(T(Math.floor(h*o+r.seed*13),Math.floor(g*s+700))-.5)*r.damage*.3*(.12+b+O);for(let e=0;e<3;e++)m[e]=c(M[e]+ne)})}var Be={id:`glitch`,name:`GLITCH`,blurb:`Cyfrowe uszkodzenie: pasy, przesunięte bloki, rozjazd kanałów, scanlines. Powtarzalne z seedem.`,seedParam:`seed`,params:Re,uniforms:e=>({u_damage:e.damage,u_block:e.block_size,u_scan:e.scanlines,u_disp:e.displacement,u_rand:e.randomness,u_seed:Math.round(e.seed)}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:Ne,scale:1,inputs:[`src`],uniforms:{u_grid:[R*e/n,R*t/n]}}]},cpu:ze},Ve=[L(`stability`,`STABILITY`,.4),L(`color_drift`,`COLOR DRIFT`,.6),L(`damage`,`DAMAGE`,.35),L(`randomness`,`RANDOMNESS`,.6),Fe(1234)];function He(e,t,n,r){let i=D(e,t,n),a=Math.max(t,n),o=R*t/a,s=R*n/a,d=Math.round(r.seed),f=e=>T(Math.floor(d*7+1),Math.floor(e*31+5)),p=(e,t)=>T(Math.floor(e+d*37),Math.floor(t+d*91)),m=(1-r.stability)*(.4+.6*r.randomness),h=[f(1),f(2),f(3)].map(e=>(e-.5)*2*r.color_drift*m*.3),g=(f(4)-.5)*2*m*.6,_=1+(f(5)-.5)*2*m*.7,v=(f(6)-.5)*2*m*.012*r.color_drift,y=(f(7)-.5)*2*m*.012*r.color_drift,b=1+(f(8)-.5)*.4*m;return w(e,t,n,(e,a,f,x,S,C)=>{let w=(x+.5)/t,E=(S+.5)/n,D=[i(w+v,E+y,0),i(w,E,1),i(w-v,E-y,2)],O=Ie(1-.22*r.damage,p(Math.floor(w*14),Math.floor(E*10))),k=[D[2]*1.1,D[1]*.9,D[0]];D=D.map((e,t)=>l(e,k[t],.6*O));let A=Math.floor(E*120),j=Ie(1-.05*r.damage,p(A,900));D=D.map(e=>e+j*.15*(p(A,901)-.3)),D=D.map((e,t)=>e*(1+h[t]));let M=.2126*D[0]+.7152*D[1]+.0722*D[2];D=D.map(e=>l(M,e,_)),D=D.map(e=>g>=0?l(e,e*e*(3-2*e),g):(e-.5)*(1+g)+.5);let N=l(1,b,u(.5,1,M)),P=T(Math.floor(w*o+d*5),Math.floor(E*s+1300))-.5;for(let e=0;e<3;e++)C[e]=c(D[e]*N+P*.1*(.4+m))})}var Ue={id:`unstable_film`,name:`UNSTABLE FILM`,blurb:`Kontrolowana mutacja koloru, kontrastu, kanałów i błędów. Każdy seed to powtarzalny wariant.`,seedParam:`seed`,params:Ve,uniforms:e=>({u_stab:e.stability,u_drift:e.color_drift,u_damage:e.damage,u_rand:e.randomness,u_seed:Math.round(e.seed)}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:Pe,scale:1,inputs:[`src`],uniforms:{u_grid:[R*e/n,R*t/n]}}]},cpu:He},We=`// PURPLE FILM: film z przesuniętymi barwami — zieleń liści -> fiolet/magenta, żółć -> róż, niebo/błękit -> turkus/zieleń.
// Mapa przesunięcia odcienia (HSV) interpolowana między kotwicami; skóra i czerwienie zostają ciepłe.
uniform sampler2D u_in0;
uniform vec2 u_grid;
uniform float u_skypink, u_shift, u_sat, u_shadow, u_hl, u_contrast, u_fade, u_grain;
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
const float SRC[14] = float[14](0.0, 30.0, 60.0, 90.0, 120.0, 150.0, 165.0, 185.0, 210.0, 240.0, 270.0, 300.0, 330.0, 360.0);
const float DEL[14] = float[14](-5.0, -5.0, -85.0, -130.0, -180.0, -230.0, -290.0, -370.0, -410.0, -450.0, -430.0, -380.0, -355.0, -365.0);
// druga mapa: ten sam film, ale błękit/niebo -> róż i fiolet zamiast turkusu
const float DEL2[14] = float[14](-5.0, -5.0, -85.0, -130.0, -180.0, -230.0, -290.0, -255.0, -255.0, -280.0, -315.0, -340.0, -345.0, -365.0);
float hueDelta2(float h) {
  for (int i = 0; i < 13; i++) {
    if (h < SRC[i + 1]) {
      float t = (h - SRC[i]) / (SRC[i + 1] - SRC[i]);
      return mix(DEL2[i], DEL2[i + 1], t * t * (3.0 - 2.0 * t));
    }
  }
  return DEL2[13];
}
float hueDelta(float h) {
  for (int i = 0; i < 13; i++) {
    if (h < SRC[i + 1]) {
      float t = (h - SRC[i]) / (SRC[i + 1] - SRC[i]);
      return mix(DEL[i], DEL[i + 1], t * t * (3.0 - 2.0 * t));
    }
  }
  return DEL[13];
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  float y0 = lum(c0);
  vec3 hsv = rgb2hsv(c0);
  float h = hsv.x * 360.0;
  // pełne przesunięcie odcienia liczone raz; siła i próg nasycenia = MIESZANIE kolorów (nie skalowanie kąta,
  // bo kąt rzędu 400° przeciągałby przy częściowej sile odcień przez całą tęczę i dawał pasy)
  float w = smoothstep(0.08, 0.42, hsv.y) * u_shift;
  float sat = clamp(hsv.y * mix(0.55, 1.2, u_sat), 0.0, 1.0);
  vec3 cTeal = hsv2rgb(vec3(fract((h + hueDelta(h)) / 360.0), sat, hsv.z));
  vec3 cPink = hsv2rgb(vec3(fract((h + hueDelta2(h)) / 360.0), sat, hsv.z));
  vec3 c = mix(c0, mix(cTeal, cPink, u_skypink), w);
  float y1 = lum(c);
  c = clamp(c * mix(1.0, y0 / max(y1, 0.03), 0.65), 0.0, 1.0);   // zachowaj jasność oryginału
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  float yy = lum(c);
  c = mix(c, c * vec3(0.85, 0.75, 1.15) + vec3(0.03, 0.0, 0.07), (1.0 - smoothstep(0.0, 0.55, yy)) * u_shadow);
  c += vec3(0.07, 0.02, 0.06) * smoothstep(0.65, 1.0, yy) * u_hl;
  c = c * (1.0 - 0.16 * u_fade) + 0.05 * u_fade * vec3(0.9, 0.8, 1.0);
  float g = hash2(floor(v_uv * u_grid)) - 0.5;
  c += g * 0.12 * u_grain * (1.0 - abs(yy - 0.5) * 1.2);
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,Ge=`// NOIR: mocne czarno-białe z filtrem barwnym (jak filtry do filmu B&W), kontrastem, przypaleniem czerni, winietą, ziarnem i lekkim odcieniem.
uniform sampler2D u_in0;
uniform vec2 u_grid;
uniform vec3 u_filter;   // wagi kanałów (filtr barwny)
uniform vec3 u_tint;     // mnożnik odcienia (luma = 1)
uniform float u_contrast, u_crush, u_grain, u_vignette, u_amount;
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
void main() {
  vec3 c = texture(u_in0, v_uv).rgb;
  float g = clamp(dot(c, u_filter), 0.0, 1.0);
  g = clamp((g - 0.5) * (1.0 + 0.9 * u_contrast) + 0.5, 0.0, 1.0);
  g = mix(g, g * g * (3.0 - 2.0 * g), u_contrast);
  g = clamp((g - 0.12 * u_crush) / (1.0 - 0.12 * u_crush), 0.0, 1.0);
  float vig = smoothstep(0.35, 0.95, distance(v_uv, vec2(0.5)));
  g *= 1.0 - u_vignette * 0.55 * vig;
  float n = hash2(floor(v_uv * u_grid)) - 0.5;
  g = clamp(g + n * 0.22 * u_grain * (1.0 - abs(g - 0.5) * 1.3), 0.0, 1.0);
  vec3 col = vec3(g) * mix(vec3(1.0), u_tint, u_amount);
  col += (u_tint - 1.0) * 0.06 * u_amount * (1.0 - g);    // odcień wchodzi też w cienie
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,Ke=`// PRISM GHOST: filtr pryzmatyczny — rozsunięte kopie obrazu po obu stronach osi, tęczowe odcienie, czysty środek kadru.
uniform sampler2D u_in0;
uniform float u_asp, u_spread, u_copies, u_angle, u_rainbow, u_blend, u_focus, u_fringe;
void main() {
  vec3 base = texture(u_in0, v_uv).rgb;
  vec2 dir = vec2(cos(u_angle), sin(u_angle) * u_asp);
  // delikatna aberracja chromatyczna głównego obrazu
  vec2 fr = dir * u_spread * 0.12 * u_fringe;
  base = vec3(texture(u_in0, v_uv + fr).r, base.g, texture(u_in0, v_uv - fr).b);
  int n = int(u_copies + 0.5);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 1; i <= 6; i++) {
    if (i > n) break;
    float j = float((i + 1) / 2) * ((i % 2 == 1) ? 1.0 : -1.0);
    float wt = pow(0.66, abs(j) - 1.0);
    vec3 s = texture(u_in0, v_uv + dir * u_spread * j * 0.5).rgb;
    vec3 tint = hsv2rgb(vec3(fract(0.08 + float(i) * 0.16), 0.85, 1.0));
    acc += s * mix(vec3(1.0), tint * 1.25, u_rainbow) * wt;
    wsum += wt;
  }
  acc /= max(wsum, 1e-4);
  vec2 q = (v_uv - 0.5) * vec2(u_asp, 1.0);
  float m = mix(1.0, smoothstep(0.08 * u_focus, 0.08 * u_focus + 0.4, length(q)), u_focus);
  float k = u_blend * m;
  vec3 c = 1.0 - (1.0 - base) * (1.0 - acc * k);      // SCREEN: kopie rozjaśniają, nie zasłaniają
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,z=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),qe=1e3,Je=(e,t,n)=>e*.2126+t*.7152+n*.0722,Ye=(e,t)=>{let n=Math.max(e,t);return[qe*e/n,qe*t/n]},Xe=[z(`shift`,`COLOR SHIFT`,.9),z(`sky_pink`,`SKY → PINK`,0),z(`saturation`,`SATURATION`,.6),z(`shadow_purple`,`SHADOW PURPLE`,.5),z(`highlight_pink`,`HIGHLIGHT PINK`,.4),z(`contrast`,`CONTRAST`,.4),z(`fade`,`FADE`,.2),z(`grain`,`GRAIN`,.3)],Ze=[0,30,60,90,120,150,165,185,210,240,270,300,330,360],Qe=[-5,-5,-85,-130,-180,-230,-290,-370,-410,-450,-430,-380,-355,-365],$e=[-5,-5,-85,-130,-180,-230,-290,-255,-255,-280,-315,-340,-345,-365];function et(e,t){for(let n=0;n<13;n++)if(t<Ze[n+1]){let r=(t-Ze[n])/(Ze[n+1]-Ze[n]);return l(e[n],e[n+1],r*r*(3-2*r))}return e[13]}function tt(e,t,n,r){let[i,a]=Ye(t,n);return w(e,t,n,(e,o,s,d,m,h)=>{let g=(d+.5)/t,_=(m+.5)/n,v=Je(e,o,s),[y,b,x]=f(e,o,s),S=u(.08,.42,b)*r.shift,C=c(b*l(.55,1.2,r.saturation)),w=e=>(e/360%1+1)%1,E=p(w(y*360+et(Qe,y*360)),C,x),D=p(w(y*360+et($e,y*360)),C,x),O=[l(E[0],D[0],r.sky_pink),l(E[1],D[1],r.sky_pink),l(E[2],D[2],r.sky_pink)],k=[l(e,O[0],S),l(o,O[1],S),l(s,O[2],S)],A=Je(k[0],k[1],k[2]),j=l(1,v/Math.max(A,.03),.65);k=k.map(e=>c(e*j)),k=k.map(e=>l(e,e*e*(3-2*e),r.contrast));let M=Je(k[0],k[1],k[2]),N=(1-u(0,.55,M))*r.shadow_purple,P=[k[0]*.85+.03,k[1]*.75,k[2]*1.15+.07];k=k.map((e,t)=>l(e,P[t],N));let ee=u(.65,1,M)*r.highlight_pink;k=[k[0]+.07*ee,k[1]+.02*ee,k[2]+.06*ee];let te=r.fade,ne=[.9,.8,1];k=k.map((e,t)=>e*(1-.16*te)+.05*te*ne[t]);let re=(T(Math.floor(g*i),Math.floor(_*a))-.5)*.12*r.grain*(1-Math.abs(M-.5)*1.2);for(let e=0;e<3;e++)h[e]=c(k[e]+re)})}var nt={id:`purple_film`,name:`PURPLE FILM`,blurb:`Film z przesuniętymi barwami: zieleń → fiolet i magenta, żółć → róż, niebo → turkus.`,params:Xe,uniforms:e=>({u_shift:e.shift,u_skypink:e.sky_pink,u_sat:e.saturation,u_shadow:e.shadow_purple,u_hl:e.highlight_pink,u_contrast:e.contrast,u_fade:e.fade,u_grain:e.grain}),passes:({width:e,height:t})=>{let[n,r]=Ye(e,t);return[{frag:We,scale:1,inputs:[`src`],uniforms:{u_grid:[n,r]}}]},cpu:tt},rt=[[.3,.59,.11],[.8,.3,-.1],[.5,.5,0],[.1,.8,.1],[0,.2,.8]],it=[[1,1,1],[1.18,.9,.86],[.86,.95,1.2],[1.14,1,.8],[.88,1.1,.95]],at=[{kind:`enum`,id:`filter`,label:`FILTR BARWNY`,default:0,options:[{value:0,label:`NEUTRAL`},{value:1,label:`RED`},{value:2,label:`YELLOW`},{value:3,label:`GREEN`},{value:4,label:`BLUE`}]},{kind:`enum`,id:`tint`,label:`ODCIEŃ`,default:0,options:[{value:0,label:`NONE`},{value:1,label:`RED`},{value:2,label:`BLUE`},{value:3,label:`SEPIA`},{value:4,label:`GREEN`}]},z(`tint_amount`,`TINT AMOUNT`,.3),z(`contrast`,`CONTRAST`,.7),z(`crush`,`BLACK CRUSH`,.4),z(`grain`,`GRAIN`,.5),z(`vignette`,`VIGNETTE`,.35)];function ot(e,t,n,r){let[i,a]=Ye(t,n),o=rt[Math.round(r.filter)]??rt[0],s=it[Math.round(r.tint)]??it[0];return w(e,t,n,(e,d,f,p,m,h)=>{let g=(p+.5)/t,_=(m+.5)/n,v=c(e*o[0]+d*o[1]+f*o[2]);v=c((v-.5)*(1+.9*r.contrast)+.5),v=l(v,v*v*(3-2*v),r.contrast),v=c((v-.12*r.crush)/(1-.12*r.crush)),v*=1-r.vignette*.55*u(.35,.95,Math.hypot(g-.5,_-.5));let y=T(Math.floor(g*i),Math.floor(_*a))-.5;v=c(v+y*.22*r.grain*(1-Math.abs(v-.5)*1.3));for(let e=0;e<3;e++)h[e]=c(v*l(1,s[e],r.tint_amount)+(s[e]-1)*.06*r.tint_amount*(1-v))})}var st={id:`noir`,name:`NOIR`,blurb:`Mocne czarno-białe: filtr barwny jak do filmu B&W, kontrast, ziarno i lekki odcień (czerwony, niebieski, sepia).`,params:at,uniforms:e=>({u_filter:rt[Math.round(e.filter)]??rt[0],u_tint:it[Math.round(e.tint)]??it[0],u_contrast:e.contrast,u_crush:e.crush,u_grain:e.grain,u_vignette:e.vignette,u_amount:e.tint_amount}),passes:({width:e,height:t})=>{let[n,r]=Ye(e,t);return[{frag:Ge,scale:1,inputs:[`src`],uniforms:{u_grid:[n,r]}}]},cpu:ot},ct=[z(`spread`,`SPREAD`,.4),{kind:`number`,id:`copies`,label:`COPIES`,min:1,max:6,step:1,default:4,displayScale:1},{kind:`number`,id:`angle`,label:`ANGLE °`,min:-.5,max:.5,step:.0025,default:.08,displayScale:360},z(`rainbow`,`RAINBOW`,.6),z(`blend`,`BLEND`,.7),z(`focus`,`CLEAR CENTER`,.5),z(`fringe`,`FRINGE`,.4)];function lt(e,t,n,r){let i=D(e,t,n),a=t/n,o=r.spread*.12,s=r.angle*Math.PI*2,d=Math.cos(s),f=Math.sin(s)*a,m=Math.round(r.copies);return w(e,t,n,(e,s,h,g,_,v)=>{let y=(g+.5)/t,b=(_+.5)/n,x=d*o*r.fringe,S=f*o*r.fringe,C=[i(y+x,b+S,0),i(y,b,1),i(y-x,b-S,2)],w=[0,0,0],T=0;for(let e=1;e<=6&&e<=m;e++){let t=Math.floor((e+1)/2)*(e%2==1?1:-1),n=.66**(Math.abs(t)-1),a=p((.08+e*.16)%1,.85,1);for(let e=0;e<3;e++)w[e]+=i(y+d*o*t*.5,b+f*o*t*.5,e)*l(1,a[e]*1.25,r.rainbow)*n;T+=n}let E=(y-.5)*a,D=b-.5,O=l(1,u(.08*r.focus,.08*r.focus+.4,Math.hypot(E,D)),r.focus),k=r.blend*O;for(let e=0;e<3;e++)v[e]=c(1-(1-C[e])*(1-w[e]/Math.max(T,1e-4)*k))})}var ut={id:`prism_ghost`,name:`PRISM GHOST`,blurb:`Filtr pryzmatyczny: rozsunięte tęczowe kopie obrazu, czysty środek kadru, aberracja na krawędziach.`,params:ct,uniforms:e=>({u_spread:e.spread*.12,u_copies:e.copies,u_angle:e.angle*Math.PI*2,u_rainbow:e.rainbow,u_blend:e.blend,u_focus:e.focus,u_fringe:e.fringe}),passes:({width:e,height:t})=>[{frag:Ke,scale:1,inputs:[`src`],uniforms:{u_asp:e/t}}],cpu:lt},dt=`// C-12 NEGATIVE: przygaszona, industrialna paleta; zimne cienie, kontrolowany kontrast, film fade.
uniform sampler2D u_in0;
uniform float u_contrast, u_shadow, u_sat, u_black, u_fade, u_toxic;
void main() {
  vec3 c = texture(u_in0, v_uv).rgb;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(y), c, mix(0.2, 1.1, u_sat));
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  c = clamp((c - 0.5) * (1.0 + 0.3 * u_contrast) + 0.5, 0.0, 1.0);
  float y2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.0, 0.5, y2);
  c = mix(c, c * vec3(0.75, 1.0, 1.1) + vec3(0.0, 0.03, 0.05), sh * u_shadow);
  float hl = smoothstep(0.6, 1.0, y2);
  c += vec3(0.03, 0.015, -0.02) * hl;
  c = mix(c, c * vec3(0.92, 1.06, 0.8) + vec3(0.0, 0.02, 0.0), u_toxic * (0.4 + 0.6 * (1.0 - hl)));
  c = c * (1.0 - u_black * 0.12) + u_black * 0.12;
  c = c * (1.0 - 0.18 * u_fade) + 0.06 * u_fade;
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,ft=`// TOKYO 2099: chłodne cienie, neonowy cyjan/magenta, glow z próbek pierścieniowych (jeden przebieg).
uniform sampler2D u_in0;
uniform vec2 u_ring;   // long/width, long/height — promień w ułamku dłuższego boku
uniform float u_cyan, u_magenta, u_shadow, u_contrast, u_glow, u_intensity;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  vec3 c = c0;
  float y = dot(c, LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.5, y);
  c = mix(c, c * vec3(0.55, 0.75, 1.25) + vec3(0.0, 0.02, 0.07), sh * u_shadow);
  float hl = smoothstep(0.35, 0.9, y);
  c = mix(c, c * vec3(0.85, 1.08, 1.2), hl * u_cyan * 0.8);
  float warm = smoothstep(0.05, 0.35, c.r - c.b);
  c = mix(c, vec3(c.r * 1.1, c.g * 0.6, c.b * 1.2 + 0.05), warm * u_magenta * 0.7);
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  c = clamp((c - 0.5) * (1.0 + 0.25 * u_contrast) + 0.5, 0.0, 1.0);
  if (u_glow > 0.001) {
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    for (int r = 0; r < 3; r++) {
      float rad = r == 0 ? 0.006 : (r == 1 ? 0.016 : 0.034);
      float w = r == 0 ? 1.0 : (r == 1 ? 0.8 : 0.5);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.785398163;
        vec3 s = texture(u_in0, v_uv + vec2(cos(a), sin(a)) * rad * u_ring).rgb;
        acc += s * smoothstep(0.55, 0.9, dot(s, LUMA)) * w;
        ws += w;
      }
    }
    vec3 tint = mix(vec3(0.3, 0.85, 1.0), vec3(1.0, 0.3, 0.8), u_magenta / (u_magenta + u_cyan + 0.001));
    c += (acc / ws) * tint * u_glow * 2.0;
  }
  o_color = vec4(mix(c0, clamp(c, 0.0, 1.0), u_intensity), 1.0);
}
`,pt=`// SOLAR DAMAGE: częściowa inwersja po progu luminancji + metaliczne światła.
uniform sampler2D u_in0;
uniform float u_threshold, u_inversion, u_contrast, u_bias, u_intensity;
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  float y = dot(c0, vec3(0.2126, 0.7152, 0.0722));
  float m = smoothstep(u_threshold - 0.06, u_threshold + 0.06, y);
  vec3 c = mix(c0, 1.0 - c0, m * u_inversion);
  float y2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 tint = hsv2rgb(vec3(mix(0.08, 0.58, u_bias), 0.45, 1.0));
  c = mix(c, vec3(y2) * tint * 1.3, 0.45);
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  o_color = vec4(mix(c0, clamp(c, 0.0, 1.0), u_intensity), 1.0);
}
`,mt=`// EXPIRED FILM: wyblakłe czernie, dominanty, nierówna tonalność, ziarno, przecieki światła. Deterministyczne.
uniform sampler2D u_in0;
uniform vec2 u_grid;   // komórki ziarna na obraz (niezależne od rozdzielczości)
uniform float u_fade, u_cast, u_grain, u_contrast, u_leaks, u_intensity;
float hash2(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return float(h) / 4294967295.0;
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec3 c0 = texture(u_in0, v_uv).rgb;
  vec3 c = c0;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  c = c * (1.0 - 0.2 * u_fade) + 0.07 * u_fade * vec3(1.0, 0.95, 0.9);
  c += (1.0 - y) * u_cast * vec3(-0.02, 0.05, 0.03);
  c += y * u_cast * vec3(0.06, 0.025, -0.05);
  float mott = vnoise(v_uv * vec2(5.0, 4.0) + vec2(3.0, 9.0)) - 0.5;
  float vig = smoothstep(0.35, 0.95, distance(v_uv, vec2(0.5)));
  c *= 1.0 + mott * 0.18 * u_fade - vig * 0.18 * u_fade;
  c += (vnoise(v_uv * vec2(3.0, 3.0) + vec2(11.0, 2.0)) - 0.5) * 0.06 * u_cast * vec3(1.0, -0.5, 0.8);
  vec2 cell = floor(v_uv * u_grid);
  float g = hash2(cell) - 0.5;
  vec3 gc = vec3(hash2(cell + vec2(101.0, 7.0)), hash2(cell + vec2(13.0, 211.0)), hash2(cell + vec2(57.0, 89.0))) - 0.5;
  c += (g * 0.14 + gc * 0.05) * u_grain * (1.0 - abs(y - 0.5) * 1.2);
  float l1 = exp(-pow(distance(v_uv, vec2(0.0, 0.2)), 2.0) * 8.0) * u_leaks;
  float l2 = exp(-pow(distance(v_uv, vec2(1.0, 0.9)), 2.0) * 14.0) * u_leaks * 0.5;
  vec3 leak = vec3(1.0, 0.35, 0.1) * l1 + vec3(0.9, 0.2, 0.55) * l2;
  c = 1.0 - (1.0 - c) * (1.0 - clamp(leak, 0.0, 1.0) * 0.8);
  o_color = vec4(mix(c0, clamp(c, 0.0, 1.0), u_intensity), 1.0);
}
`,B=(e,t,n)=>({kind:`number`,id:e,label:t,min:0,max:1,step:.01,default:n}),V=(e,t,n)=>e*.2126+t*.7152+n*.0722,H=(e,t)=>l(e,e*e*(3-2*e),t),ht=[B(`contrast`,`CONTRAST`,.5),B(`shadow_cyan`,`SHADOW CYAN`,.5),B(`saturation`,`SATURATION`,.55),B(`black_level`,`BLACK LEVEL`,.2),B(`film_fade`,`FILM FADE`,.25),B(`toxic`,`TOXIC TINT`,0)];function gt(e,t,n,r){return w(e,t,n,(e,t,n,i,a,o)=>{let s=V(e,t,n),d=l(.2,1.1,r.saturation),f=[l(s,e,d),l(s,t,d),l(s,n,d)];f=f.map(e=>c((H(e,r.contrast)-.5)*(1+.3*r.contrast)+.5));let p=V(f[0],f[1],f[2]),m=(1-u(0,.5,p))*r.shadow_cyan;f=[l(f[0],f[0]*.75,m),l(f[1],f[1]+.03,m),l(f[2],f[2]*1.1+.05,m)];let h=u(.6,1,p);f=[f[0]+.03*h,f[1]+.015*h,f[2]-.02*h];let g=r.toxic*(.4+.6*(1-h));f=[l(f[0],f[0]*.92,g),l(f[1],f[1]*1.06+.02,g),l(f[2],f[2]*.8,g)];for(let e=0;e<3;e++){let t=f[e]*(1-r.black_level*.12)+r.black_level*.12;t=t*(1-.18*r.film_fade)+.06*r.film_fade,o[e]=c(t)}})}var _t={id:`c12`,name:`C-12 NEGATIVE`,blurb:`Zimne cienie, przygaszona industrialna paleta, film fade.`,params:ht,uniforms:e=>({u_contrast:e.contrast,u_shadow:e.shadow_cyan,u_sat:e.saturation,u_black:e.black_level,u_fade:e.film_fade,u_toxic:e.toxic}),passes:()=>[{frag:dt,scale:1,inputs:[`src`]}],cpu:gt},vt=[B(`neon_cyan`,`NEON CYAN`,.6),B(`magenta`,`MAGENTA`,.5),B(`shadow_blue`,`SHADOW BLUE`,.6),B(`contrast`,`CONTRAST`,.45),B(`glow`,`GLOW`,.4),B(`intensity`,`INTENSITY`,1)],yt=[[.006,1],[.016,.8],[.034,.5]];function bt(e,t,n,r){let i=Math.max(t,n),a=i/t,o=i/n,s=D(e,t,n),d=r.magenta/(r.magenta+r.neon_cyan+.001),f=[l(.3,1,d),l(.85,.3,d),l(1,.8,d)];return w(e,t,n,(e,i,d,p,m,h)=>{let g=V(e,i,d),_=(1-u(0,.5,g))*r.shadow_blue,v=[l(e,e*.55,_),l(i,i*.75+.02,_),l(d,d*1.25+.07,_)],y=u(.35,.9,g)*r.neon_cyan*.8;v=[l(v[0],v[0]*.85,y),l(v[1],v[1]*1.08,y),l(v[2],v[2]*1.2,y)];let b=u(.05,.35,v[0]-v[2])*r.magenta*.7;if(v=[l(v[0],v[0]*1.1,b),l(v[1],v[1]*.6,b),l(v[2],v[2]*1.2+.05,b)],v=v.map(e=>c((H(e,r.contrast)-.5)*(1+.25*r.contrast)+.5)),r.glow>.001){let e=(p+.5)/t,i=(m+.5)/n,c=[0,0,0],l=0;for(let[t,n]of yt)for(let r=0;r<8;r++){let d=r*.785398163,f=e+Math.cos(d)*t*a,p=i+Math.sin(d)*t*o,m=[s(f,p,0),s(f,p,1),s(f,p,2)],h=u(.55,.9,V(m[0],m[1],m[2]))*n;for(let e=0;e<3;e++)c[e]+=m[e]*h;l+=n}for(let e=0;e<3;e++)v[e]+=c[e]/l*f[e]*r.glow*2}h[0]=l(e,c(v[0]),r.intensity),h[1]=l(i,c(v[1]),r.intensity),h[2]=l(d,c(v[2]),r.intensity)})}var xt={id:`tokyo_2099`,name:`TOKYO 2099`,blurb:`Cyberpunkowa ulica: neonowy cyjan i magenta, chłodne cienie, glow.`,params:vt,uniforms:e=>({u_cyan:e.neon_cyan,u_magenta:e.magenta,u_shadow:e.shadow_blue,u_contrast:e.contrast,u_glow:e.glow,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:ft,scale:1,inputs:[`src`],uniforms:{u_ring:[n/e,n/t]}}]},cpu:bt},St=[B(`threshold`,`THRESHOLD`,.5),B(`inversion`,`INVERSION`,.8),B(`contrast`,`CONTRAST`,.4),B(`color_bias`,`COLOR BIAS`,.55),B(`intensity`,`INTENSITY`,1)];function Ct(e,t,n,r){let i=p(l(.08,.58,r.color_bias),.45,1);return w(e,t,n,(e,t,n,a,o,s)=>{let d=u(r.threshold-.06,r.threshold+.06,V(e,t,n))*r.inversion,f=[l(e,1-e,d),l(t,1-t,d),l(n,1-n,d)],p=V(f[0],f[1],f[2]);f=f.map((e,t)=>l(e,p*i[t]*1.3,.45));let m=[e,t,n];for(let e=0;e<3;e++)s[e]=l(m[e],c(H(f[e],r.contrast)),r.intensity)})}var wt={id:`solar_damage`,name:`SOLAR DAMAGE`,blurb:`Solaryzacja: częściowa inwersja tonów, metaliczne światła.`,params:St,uniforms:e=>({u_threshold:e.threshold,u_inversion:e.inversion,u_contrast:e.contrast,u_bias:e.color_bias,u_intensity:e.intensity}),passes:()=>[{frag:pt,scale:1,inputs:[`src`]}],cpu:Ct},Tt=[B(`fade`,`FADE`,.3),B(`color_cast`,`COLOR CAST`,.3),B(`grain`,`GRAIN`,.3),B(`contrast`,`CONTRAST`,.35),B(`leaks`,`LEAKS`,.1),B(`intensity`,`INTENSITY`,1)],Et=1e3;function Dt(e,t,n,r){let i=Math.max(t,n),a=Et*t/i,o=Et*n/i;return w(e,t,n,(e,i,s,d,f,p)=>{let m=(d+.5)/t,h=(f+.5)/n,g=V(e,i,s),_=[H(e,r.contrast),H(i,r.contrast),H(s,r.contrast)];_=_.map((e,t)=>e*(1-.2*r.fade)+.07*r.fade*[1,.95,.9][t]),_=[_[0]+(1-g)*r.color_cast*-.02+g*r.color_cast*.06,_[1]+(1-g)*r.color_cast*.05+g*r.color_cast*.025,_[2]+(1-g)*r.color_cast*.03+g*r.color_cast*-.05];let v=E(m*5+3,h*4+9)-.5,y=u(.35,.95,Math.hypot(m-.5,h-.5)),b=1+v*.18*r.fade-y*.18*r.fade,x=(E(m*3+11,h*3+2)-.5)*.06*r.color_cast;_=[_[0]*b+x,_[1]*b-x*.5,_[2]*b+x*.8];let S=Math.floor(m*a),C=Math.floor(h*o),w=T(S,C)-.5,D=[T(S+101,C+7)-.5,T(S+13,C+211)-.5,T(S+57,C+89)-.5],O=r.grain*(1-Math.abs(g-.5)*1.2);_=_.map((e,t)=>e+(w*.14+D[t]*.05)*O);let k=Math.exp(-(m*m+(h-.2)**2)*8)*r.leaks,A=Math.exp(-((m-1)**2+(h-.9)**2)*14)*r.leaks*.5,j=[1*k+.9*A,.35*k+.2*A,.1*k+.55*A].map(c);_=_.map((e,t)=>1-(1-e)*(1-j[t]*.8));let M=[e,i,s];for(let e=0;e<3;e++)p[e]=l(M[e],c(_[e]),r.intensity)})}var Ot={id:`expired_film`,name:`EXPIRED FILM`,blurb:`Przeterminowany film: wyblakłe kolory, dominanty, ziarno, przecieki.`,params:Tt,uniforms:e=>({u_fade:e.fade,u_cast:e.color_cast,u_grain:e.grain,u_contrast:e.contrast,u_leaks:e.leaks,u_intensity:e.intensity}),passes:({width:e,height:t})=>{let n=Math.max(e,t);return[{frag:mt,scale:1,inputs:[`src`],uniforms:{u_grid:[Et*e/n,Et*t/n]}}]},cpu:Dt};function kt(e){let t={};for(let n of e.params)t[n.id]=n.default;return t}var At=new Map;function U(e){At.set(e.id,e)}function W(e){return At.get(e)}function jt(){return[...At.values()]}U(Me),U(S),U(P),U(nt),U(ut),U(se),U(he),U(st),U(Se),U(Ae),U(_t),U(xt),U(wt),U(Ot),U(Be),U(Ue);var Mt=`// Pełnoekranowy trójkąt. Konwencja tekstur: wiersz 0 = GÓRA obrazu (t=0).
// u_flipY = 1 tylko przy rysowaniu na ekran, u_region pozwala wyrenderować wycinek (eksport paskami).
uniform float u_flipY;
uniform vec4 u_region; // x0, y0, szer., wys. w jednostkach UV
out vec2 v_uv;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  vec2 local = vec2(pos.x, mix(pos.y, 1.0 - pos.y, u_flipY));
  v_uv = u_region.xy + local * u_region.zw;
}
`,Nt=`in vec2 v_uv;
out vec4 o_color;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// miękkie "pasmo" barwy: 1 wewnątrz [lo,hi], płynne zejście na szerokości f
float band(float h, float lo, float hi, float f) {
  return smoothstep(lo - f, lo + f, h) * (1.0 - smoothstep(hi - f, hi + f, h));
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(vec3(c.x) + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`,Pt=`// Obrót/odbicie wg EXIF Orientation (+ ewentualne zmniejszenie dzięki mipmapom).
// raw = A * out + B  (współrzędne UV, y w dół)
uniform sampler2D u_in0;
uniform mat2 u_orientA;
uniform vec2 u_orientB;
void main() {
  vec2 raw = u_orientA * v_uv + u_orientB;
  o_color = vec4(texture(u_in0, raw).rgb, 1.0);
}
`,Ft=`// DOUBLE EXPOSURE: klatka A (u_in0, już po obrocie EXIF) + klatka B (u_in1, z mipmapami).
// B jest dopasowana "cover" do kadru A, potem skala/przesunięcie/obrót/odbicie.
uniform sampler2D u_in0;
uniform sampler2D u_in1;
uniform float u_aspA, u_aspB;
uniform float u_mode, u_blend, u_mask, u_scale, u_posx, u_posy, u_rot, u_mirror, u_invert, u_contrast, u_mono;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 a = texture(u_in0, v_uv).rgb;

  vec2 q = (v_uv - vec2(0.5 + u_posx, 0.5 + u_posy)) * vec2(u_aspA, 1.0);
  float cs = cos(u_rot), sn = sin(u_rot);
  q = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y);
  q /= max(u_scale, 0.05);
  vec2 bs = (u_aspB >= u_aspA) ? vec2(u_aspB, 1.0) : vec2(u_aspA, u_aspA / u_aspB);
  vec2 uvb = q / bs + 0.5;
  if (u_mirror > 0.5) uvb.x = 1.0 - uvb.x;
  float inside = step(0.0, uvb.x) * step(uvb.x, 1.0) * step(0.0, uvb.y) * step(uvb.y, 1.0);

  vec3 b = texture(u_in1, clamp(uvb, 0.0, 1.0)).rgb;
  b = mix(b, vec3(lum(b)), u_mono);
  b = mix(b, b * b * (3.0 - 2.0 * b), u_contrast);
  b = (u_invert > 0.5) ? 1.0 - b : b;

  int m = int(u_mode + 0.5);
  vec3 r;
  if (m == 0)      r = 1.0 - (1.0 - a) * (1.0 - b);                              // SCREEN
  else if (m == 1) r = min(a + b, 1.0);                                          // ADD
  else if (m == 2) r = max(a, b);                                                // LIGHTEN
  else if (m == 3) r = min(a, b);                                                // DARKEN
  else if (m == 4) r = a * b;                                                    // MULTIPLY
  else if (m == 5) r = mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a)); // OVERLAY
  else if (m == 6) r = b;                                                        // NORMAL
  else             r = abs(a - b);                                               // DIFFERENCE

  // SHADOW MASK: B przebija głównie przez ciemne partie A (jak w prawdziwej podwójnej ekspozycji)
  float w = u_blend * inside * mix(1.0, 1.0 - smoothstep(0.3, 0.9, lum(a)), u_mask);
  o_color = vec4(clamp(mix(a, r, w), 0.0, 1.0), 1.0);
}
`,It=`// ENGINE (wspólny przebieg wykańczający). Doklejany za efektem: fx_main() liczy efekt,
// potem: COLOR TRANSITION -> HIGHLIGHT PROTECTION -> SHADOW PRESERVATION -> FILM GRAIN ENGINE -> MASK PREVIEW.
// FIN_SRC = oryginał (po składaniu), ten sam v_uv co w efekcie.
uniform vec4 u_finA;   // hl, sh, tr, mask
uniform vec4 u_finB;   // grain, size, color, shadow-weight
uniform vec2 u_finDim; // szerokość, wysokość

float fLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
uint fHash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float fRand(ivec2 c, uint s) {
  uint h = fHash(uint(c.x + 4096) * 1973u + fHash(uint(c.y + 4096) * 9277u + s));
  return float(h & 0xffffffu) / 16777215.0;
}

vec3 finishColor(vec3 e, vec3 o) {
  float hl = u_finA.x, sh = u_finA.y, tr = u_finA.z;
  vec3 c = e;
  float Le = fLuma(e), Lo = fLuma(o);

  // COLOR TRANSITION: w jasnych, prawie neutralnych miejscach oryginału (chmury) barwa efektu jest niestabilna
  // -> ściągamy chromę efektu do luminancji, płynnie (bez progów).
  if (tr > 0.0) {
    float so = max(o.r, max(o.g, o.b)) - min(o.r, min(o.g, o.b));
    float wt = (1.0 - smoothstep(0.03, 0.24, so)) * smoothstep(0.30, 0.65, Lo) * tr;
    c = mix(c, vec3(Le), wt * 0.85);
  }

  // HIGHLIGHT PROTECTION
  if (hl > 0.0) {
    float L0 = fLuma(c);
    // 1) w jasnych miejscach oryginału efekt nie może rozjaśniać ponad oryginał
    float wo = smoothstep(0.62, 0.97, Lo) * hl * 0.7;
    float Lt = mix(L0, min(L0, Lo + 0.02), wo);
    // 2) odzysk górnych półtonów (biel zostaje bielą)
    float t = clamp((Lt - 0.55) / 0.45, 0.0, 1.0);
    Lt -= hl * 0.12 * 4.0 * t * (1.0 - t);
    c *= Lt / max(L0, 1.0e-3);
    // 3) zamiast ucinać kanały: odsycenie do luminancji tak, by zmieścić się w 0..1 (zachowuje barwę)
    float m = max(c.r, max(c.g, c.b));
    if (m > 1.0) {
      float Lc = clamp(fLuma(c), 0.0, 1.0);
      float k = clamp((1.0 - Lc) / max(m - Lc, 1.0e-4), 0.0, 1.0);
      c = mix(c, vec3(Lc) + (c - vec3(Lc)) * k, hl);
    }
  }

  // SHADOW PRESERVATION: tam, gdzie efekt zgniótł cień poniżej oryginału, oddajemy detal (nie rozjaśniamy czerni do szarości)
  if (sh > 0.0) {
    float Lc = fLuma(c);
    float t = 1.0 - smoothstep(0.02, 0.30, Lc);
    float ratio = clamp(Lo / max(Lc, 0.02), 1.0, 3.0);
    c = mix(c, c * ratio, t * sh * 0.7);
    c += sh * 0.015 * t;
  }
  return c;
}

vec3 finishGrain(vec3 c) {
  float amt = u_finB.x;
  if (amt <= 0.0) return c;
  float size = u_finB.y;
  float cells = mix(1800.0, 500.0, size);                 // komórek na dłuższym boku => preview == eksport
  vec2 g = v_uv * u_finDim * (cells / max(u_finDim.x, u_finDim.y));
  ivec2 ic = ivec2(floor(g));
  float n0 = (fRand(ic, 11u) + fRand(ic, 12u) - 1.0);     // ~trójkątny rozkład
  vec3 n = vec3(n0);
  if (u_finB.z > 0.0) n = mix(n, vec3(fRand(ic, 21u) + fRand(ic, 22u) - 1.0, n0, fRand(ic, 31u) + fRand(ic, 32u) - 1.0), u_finB.z);
  float L = fLuma(c);
  float resp = mix(1.0, 4.0 * L * (1.0 - L) + 0.15, 0.7);  // ziarno najsilniejsze w półtonach
  resp = mix(resp, mix(1.0, 1.0 - L, 0.9), u_finB.w);      // suwak SHADOWS: ciągnie ziarno do cieni
  return c + n * amt * 0.22 * resp;
}

void main() {
  fx_main();
  vec3 e = o_color.rgb;
  vec3 o = texture(FIN_SRC, v_uv).rgb;
  vec3 c = finishColor(e, o);
  int mask = int(u_finA.w + 0.5);
  if (mask == 1) {                    // AFFECTED: gdzie efekt zmienia obraz (ciemny -> fiolet -> żółty)
    float d = clamp(length(c - o) * 1.6, 0.0, 1.0);
    vec3 heat = d < 0.5 ? mix(vec3(0.02, 0.02, 0.10), vec3(0.75, 0.10, 0.65), d * 2.0)
                        : mix(vec3(0.75, 0.10, 0.65), vec3(1.0, 0.95, 0.15), (d - 0.5) * 2.0);
    o_color = vec4(mix(vec3(fLuma(o)) * 0.35, heat, 0.78), 1.0);
    return;
  }
  if (mask == 2) {                    // CLIPPING: czerwone = przepał, niebieskie = zatkane cienie (wynik końcowy)
    vec3 f = clamp(c, 0.0, 1.0);
    vec3 col = vec3(fLuma(f)) * 0.7;
    if (max(f.r, max(f.g, f.b)) >= 0.985) col = mix(col, vec3(1.0, 0.1, 0.1), 0.85);
    if (max(f.r, max(f.g, f.b)) <= 0.03) col = mix(col, vec3(0.1, 0.35, 1.0), 0.85);
    o_color = vec4(col, 1.0);
    return;
  }
  if (mask == 3) {                    // ENGINE: gdzie moduł (HL/SH/TR) zmienił wynik efektu
    float d = clamp(length(c - e) * 6.0, 0.0, 1.0);
    o_color = vec4(mix(vec3(fLuma(clamp(e, 0.0, 1.0))) * 0.4, vec3(0.1, 1.0, 0.45), d * 0.85), 1.0);
    return;
  }
  o_color = vec4(clamp(finishGrain(c), 0.0, 1.0), 1.0);
}
`,G=[{kind:`number`,id:`hl`,label:`HIGHLIGHT PROTECT`,min:0,max:1,step:.01,default:0},{kind:`number`,id:`sh`,label:`SHADOW KEEP`,min:0,max:1,step:.01,default:0},{kind:`number`,id:`tr`,label:`COLOR TRANSITION`,min:0,max:1,step:.01,default:0},{kind:`number`,id:`grain`,label:`FILM GRAIN`,min:0,max:1,step:.01,default:0},{kind:`number`,id:`grain_size`,label:`GRAIN SIZE`,min:0,max:1,step:.01,default:.35},{kind:`number`,id:`grain_color`,label:`GRAIN COLOR`,min:0,max:1,step:.01,default:0},{kind:`number`,id:`grain_shadow`,label:`GRAIN → SHADOWS`,min:0,max:1,step:.01,default:0},{kind:`enum`,id:`mask`,label:`MASK PREVIEW`,default:0,options:[{value:0,label:`OFF`},{value:1,label:`AFFECTED`},{value:2,label:`CLIPPING`},{value:3,label:`ENGINE`}]}],Lt=()=>Object.fromEntries(G.map(e=>[e.id,e.default])),Rt=e=>e.hl>0||e.sh>0||e.tr>0||e.grain>0||e.mask>0,K=e=>({...e,mask:0});function zt(e,t,n){return{u_finA0:[e.hl,e.sh],u_finA1:[e.tr,e.mask],u_finB0:[e.grain,e.grain_size],u_finB1:[e.grain_color,e.grain_shadow],u_finDim:[t,n]}}function Bt(e,t){let n=e.replace(/void\s+main\s*\(\s*(void)?\s*\)/,`void fx_main()`);if(n===e)throw Error(`Shader efektu nie ma main()`);return`${n}\nuniform sampler2D u_in${t};\n#define FIN_SRC u_in${t}\n${It.replace(`uniform vec4 u_finA;   // hl, sh, tr, mask`,`uniform vec2 u_finA0; uniform vec2 u_finA1;`).replace(`uniform vec4 u_finB;   // grain, size, color, shadow-weight`,`uniform vec2 u_finB0; uniform vec2 u_finB1;`).replace(/u_finA\.x/g,`u_finA0.x`).replace(/u_finA\.y/g,`u_finA0.y`).replace(/u_finA\.z/g,`u_finA1.x`).replace(/u_finA\.w/g,`u_finA1.y`).replace(/u_finB\.x/g,`u_finB0.x`).replace(/u_finB\.y/g,`u_finB0.y`).replace(/u_finB\.z/g,`u_finB1.x`).replace(/u_finB\.w/g,`u_finB1.y`)}`}var q=(e,t,n)=>e*.2126+t*.7152+n*.0722,Vt=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},J=(e,t,n)=>e+(t-e)*n,Ht=e=>(e=(e^e>>>16)>>>0,e=Math.imul(e,2146121005)>>>0,e=(e^e>>>15)>>>0,e=Math.imul(e,2221713035)>>>0,(e^e>>>16)>>>0),Y=(e,t,n)=>{let r=Math.imul(t+4096>>>0,9277)+n>>>0;return(Ht(Math.imul(e+4096>>>0,1973)+Ht(r)>>>0)&16777215)/16777215};function Ut(e,t,n,r,i,a,o){let s=[e[0],e[1],e[2]],c=q(e[0],e[1],e[2]),l=q(t[0],t[1],t[2]);if(n.tr>0){let e=(1-Vt(.03,.24,Math.max(t[0],t[1],t[2])-Math.min(t[0],t[1],t[2])))*Vt(.3,.65,l)*n.tr*.85;s=s.map(t=>J(t,c,e))}if(n.hl>0){let e=q(s[0],s[1],s[2]),t=Vt(.62,.97,l)*n.hl*.7,r=J(e,Math.min(e,l+.02),t),i=Math.min(1,Math.max(0,(r-.55)/.45));r-=n.hl*.12*4*i*(1-i),s=s.map(t=>t*r/Math.max(e,.001));let a=Math.max(s[0],s[1],s[2]);if(a>1){let e=Math.min(1,Math.max(0,q(s[0],s[1],s[2]))),t=Math.min(1,Math.max(0,(1-e)/Math.max(a-e,1e-4)));s=s.map(r=>J(r,e+(r-e)*t,n.hl))}}if(n.sh>0){let e=q(s[0],s[1],s[2]),t=1-Vt(.02,.3,e),r=Math.min(3,Math.max(1,l/Math.max(e,.02)));s=s.map(e=>J(e,e*r,t*n.sh*.7)+n.sh*.015*t)}if(n.grain>0){let e=J(1800,500,n.grain_size)/Math.max(a,o),t=Math.floor((r+.5)*e),c=Math.floor((i+.5)*e),l=Y(t,c,11)+Y(t,c,12)-1,u=[J(l,Y(t,c,21)+Y(t,c,22)-1,n.grain_color),l,J(l,Y(t,c,31)+Y(t,c,32)-1,n.grain_color)],d=q(s[0],s[1],s[2]),f=J(1,4*d*(1-d)+.15,.7);f=J(f,J(1,1-d,.9),n.grain_shadow),s=s.map((e,t)=>e+u[t]*n.grain*.22*f)}return s.map(e=>Math.min(1,Math.max(0,e)))}function Wt(e,t,n,r,i){let a=new Uint8ClampedArray(e.length);for(let o=0;o<r;o++)for(let s=0;s<n;s++){let c=(o*n+s)*4,l=Ut([e[c]/255,e[c+1]/255,e[c+2]/255],[t[c]/255,t[c+1]/255,t[c+2]/255],i,s,o,n,r);a[c]=l[0]*255+.5,a[c+1]=l[1]*255+.5,a[c+2]=l[2]*255+.5,a[c+3]=255}return a}var Gt=`#version 300 es
precision highp float;
precision highp sampler2D;
`,Kt={1:{a:[1,0,0,1],b:[0,0]},2:{a:[-1,0,0,1],b:[1,0]},3:{a:[-1,0,0,-1],b:[1,1]},4:{a:[1,0,0,-1],b:[0,1]},5:{a:[0,1,1,0],b:[0,0]},6:{a:[0,-1,1,0],b:[0,1]},7:{a:[0,-1,-1,0],b:[1,1]},8:{a:[0,1,-1,0],b:[1,0]}},qt=class e{setPre(e){this.pre=e}enterStack(){let e=this.pre,t=this.src;if(!e.length||!t)return()=>{};let{w:n,h:r}=t,i=`${this.composeKey}|${n}x${r}|`+e.map(e=>e.effect.id+JSON.stringify(e.effect.uniforms(e.params))).join(`>`);if(i!==this.stackKey||!this.stackTex){let a=t;for(let t=0;t<e.length;t++){let i=this.target(`stk${t%2}`,n,r);this.src=a;let o=this.makePlan(e[t].effect,e[t].params);this.runPrefix(o);let s=o.passes[o.passes.length-1];this.drawPass(this.program(s.frag),s.inputs.map(e=>this.resolve(e)),this.uniformsFor(o,s),i,{w:n,h:r,flipY:!1,region:[0,0,1,1]}),a=i}this.stackTex=a,this.stackKey=i}return this.finSrc=t,this.src=this.stackTex,()=>{this.src=t,this.finSrc=null}}setFinish(e){this.finish=e}constructor(e,t){this.canvas=e,this.lost=!1,this.progs=new Map,this.targets=new Map,this.outputs=[],this.src=null,this.base=null,this.layer=null,this.composed=null,this.composeKey=``,this.layerVersion=0,this.finish=null,this.pre=[],this.stackKey=``,this.stackTex=null,this.finSrc=null,this.regionKey=``,this.gl=t,this.maxTextureSize=t.getParameter(t.MAX_TEXTURE_SIZE),this.vao=t.createVertexArray(),this.fbo=t.createFramebuffer(),e.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),this.lost=!0}),e.addEventListener(`webglcontextrestored`,()=>{this.lost=!1,this.progs.clear(),this.targets.clear(),this.outputs=[],this.src=null,this.base=null,this.layer=null,this.composed=null,this.composeKey=``,this.vao=t.createVertexArray(),this.fbo=t.createFramebuffer(),this.onContextRestored?.()})}static create(t){let n=t.getContext(`webgl2`,{alpha:!1,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1,powerPreference:`high-performance`});return n?new e(t,n):null}get sourceSize(){return this.src?{width:this.src.w,height:this.src.h}:null}uploadOriented(e,t,n,r,i,a){let o=this.gl;if(Math.max(t,n)>this.maxTextureSize)throw Error(`Obraz ${t}×${n} przekracza limit tekstury GPU (${this.maxTextureSize}px).`);let s=Kt[r]??Kt[1],c=r>=5&&r<=8,l=c?n:t,u=c?t:n,d=Math.min(1,i/Math.max(l,u)),f=Math.max(1,Math.round(l*d)),p=Math.max(1,Math.round(u*d)),m=this.makeTex(t,n);o.bindTexture(o.TEXTURE_2D,m.tex),o.pixelStorei(o.UNPACK_FLIP_Y_WEBGL,!1),o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),o.texImage2D(o.TEXTURE_2D,0,o.RGBA,o.RGBA,o.UNSIGNED_BYTE,e),d<1&&(o.generateMipmap(o.TEXTURE_2D),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR_MIPMAP_LINEAR));let h=this.makeTex(f,p);return o.bindTexture(o.TEXTURE_2D,h.tex),o.texImage2D(o.TEXTURE_2D,0,o.RGBA,f,p,0,o.RGBA,o.UNSIGNED_BYTE,null),this.drawPass(this.program(Pt),[m.tex],{u_orientA:{mat2:s.a},u_orientB:s.b},h,{w:f,h:p,flipY:!1,region:[0,0,1,1]}),o.deleteTexture(m.tex),a&&(o.bindTexture(o.TEXTURE_2D,h.tex),o.generateMipmap(o.TEXTURE_2D),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR_MIPMAP_LINEAR)),h}loadSource(e,t,n,r,i){let a=this.gl,o=this.uploadOriented(e,t,n,r,i,!1);return this.base&&a.deleteTexture(this.base.tex),this.composed&&a.deleteTexture(this.composed.tex),this.base=o,this.src=o,this.composed=null,this.composeKey=``,this.dropTargets(),this.canvas.width=o.w,this.canvas.height=o.h,{width:o.w,height:o.h}}loadLayer(e,t,n,r,i){let a=this.uploadOriented(e,t,n,r,i,!0);return this.layer&&this.gl.deleteTexture(this.layer.tex),this.layer=a,this.layerVersion++,this.composeKey=``,{width:a.w,height:a.h}}get hasLayer(){return this.layer!==null}clearLayer(){let e=this.gl;this.layer&&e.deleteTexture(this.layer.tex),this.composed&&e.deleteTexture(this.composed.tex),this.layer=null,this.composed=null,this.composeKey=``,this.src=this.base}applyCompose(e,t){if(!this.base||this.lost)return;if(!e||!t||!this.layer){this.src=this.base;return}let n=this.base,r=this.layer,i=this.gl,a=e.uniforms(t),o=`${this.layerVersion}|${n.w}x${n.h}|${JSON.stringify(a)}`;this.composed||(this.composed=this.makeTex(n.w,n.h),i.bindTexture(i.TEXTURE_2D,this.composed.tex),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,n.w,n.h,0,i.RGBA,i.UNSIGNED_BYTE,null),this.composeKey=``),o!==this.composeKey&&(this.drawPass(this.program(Ft),[n.tex,r.tex],{...a,u_aspA:n.w/n.h,u_aspB:r.w/r.h},this.composed,{w:n.w,h:n.h,flipY:!1,region:[0,0,1,1]}),this.composeKey=o),this.src=this.composed}renderToCanvas(e,t){if(!this.src||this.lost)return;let n=this.enterStack();try{let n=this.makePlan(e,t);this.runPrefix(n),this.runFinal(n,{w:this.canvas.width,h:this.canvas.height,flipY:!0,region:[0,0,1,1]})}finally{n()}}renderRegion(e,t,n,r,i,a){if(!this.src||this.lost)return;let o=this.enterStack();try{let o=this.src;(this.canvas.width!==i||this.canvas.height!==a)&&(this.canvas.width=i,this.canvas.height=a);let s=this.makePlan(e,t),c=`${this.stackKey}|${this.composeKey}|${e?.id??`-`}|${JSON.stringify(s.common)}|${o.w}x${o.h}`;c!==this.regionKey&&(this.runPrefix(s),this.regionKey=c),this.runFinal(s,{w:i,h:a,flipY:!0,region:[n/o.w,r/o.h,i/o.w,a/o.h]})}finally{o()}}async exportStrips(e,t,n,r,i){if(!this.src)throw Error(`Brak źródła`);this.finish&&=K(this.finish);let{w:a,h:o}=this.src;this.canvas.width=a,this.canvas.height=n;let s=this.enterStack();try{let s=this.makePlan(e,t);this.runPrefix(s);let c=this.gl,l=new Uint8Array(a*n*4);for(let e=0;e<o;e+=n){if(this.lost)throw Error(`Utracono kontekst GPU (brak pamięci?).`);let t=Math.min(n,o-e);this.runFinal(s,{w:a,h:t,flipY:!1,region:[0,e/o,1,t/o]}),c.readPixels(0,0,a,t,c.RGBA,c.UNSIGNED_BYTE,l),r(l,t,e),i?.((e+t)/o),await new Promise(e=>setTimeout(e,0))}}finally{s()}}dispose(){let e=this.gl;for(let t of this.targets.values())e.deleteTexture(t.tex);for(let t of[this.base,this.layer,this.composed])t&&e.deleteTexture(t.tex);this.targets.clear(),this.src=null,this.base=null,this.layer=null,this.composed=null,e.getExtension(`WEBGL_lose_context`)?.loseContext()}makePlan(e,t){let n=this.src;return e?{passes:e.passes({width:n.w,height:n.h}),common:e.uniforms(t),effect:!0}:{passes:[{frag:je,scale:1,inputs:[`src`]}],common:{},effect:!1}}resolve(e){return e===`src`?this.src.tex:this.outputs[e].tex}runPrefix(e){let t=this.src;this.outputs=[];for(let n=0;n<e.passes.length-1;n++){let r=e.passes[n],i=Math.max(1,Math.round(t.w*r.scale)),a=Math.max(1,Math.round(t.h*r.scale)),o=this.target(`p${n}`,i,a);this.drawPass(this.program(r.frag),r.inputs.map(e=>this.resolve(e)),this.uniformsFor(e,r),o,{w:i,h:a,flipY:!1,region:[0,0,1,1]}),this.outputs[n]=o}}runFinal(e,t){let n=e.passes[e.passes.length-1],r=e.effect&&this.finish&&Rt(this.finish)?this.finish:null;if(!r){this.drawPass(this.program(n.frag),n.inputs.map(e=>this.resolve(e)),this.uniformsFor(e,n),null,t);return}let i=n.inputs.length,a=this.finSrc??this.src;this.drawPass(this.program(Bt(n.frag,i)),[...n.inputs.map(e=>this.resolve(e)),a.tex],{...this.uniformsFor(e,n),...zt(r,a.w,a.h)},null,t)}uniformsFor(e,t){let n=this.src;return{...e.common,u_srcTexel:[1/n.w,1/n.h],...t.uniforms??{}}}drawPass(e,t,n,r,i){let a=this.gl;a.bindFramebuffer(a.FRAMEBUFFER,r?this.fbo:null),r&&a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0,a.TEXTURE_2D,r.tex,0),a.viewport(0,0,i.w,i.h),a.disable(a.BLEND),a.useProgram(e.prog),t.forEach((t,n)=>{a.activeTexture(a.TEXTURE0+n),a.bindTexture(a.TEXTURE_2D,t);let r=this.loc(e,`u_in${n}`);r&&a.uniform1i(r,n)});let o=this.loc(e,`u_flipY`);o&&a.uniform1f(o,+!!i.flipY);let s=this.loc(e,`u_region`);s&&a.uniform4f(s,i.region[0],i.region[1],i.region[2],i.region[3]);for(let[t,r]of Object.entries(n)){let n=this.loc(e,t);n&&(typeof r==`number`?a.uniform1f(n,r):Array.isArray(r)?r.length===3?a.uniform3f(n,r[0],r[1],r[2]):a.uniform2f(n,r[0],r[1]):a.uniformMatrix2fv(n,!1,r.mat2))}a.bindVertexArray(this.vao),a.drawArrays(a.TRIANGLES,0,3)}loc(e,t){let n=e.locs.get(t);return n===void 0&&(n=this.gl.getUniformLocation(e.prog,t),e.locs.set(t,n)),n}program(e){let t=this.progs.get(e);if(t)return t;let n=this.gl,r=this.compile(n.VERTEX_SHADER,`#version 300 es
`+Mt),i=this.compile(n.FRAGMENT_SHADER,Gt+Nt+e),a=n.createProgram();if(n.attachShader(a,r),n.attachShader(a,i),n.linkProgram(a),!n.getProgramParameter(a,n.LINK_STATUS))throw Error(`Shader link: `+n.getProgramInfoLog(a));n.deleteShader(r),n.deleteShader(i);let o={prog:a,locs:new Map};return this.progs.set(e,o),o}compile(e,t){let n=this.gl,r=n.createShader(e);if(n.shaderSource(r,t),n.compileShader(r),!n.getShaderParameter(r,n.COMPILE_STATUS))throw Error(`Shader compile: `+n.getShaderInfoLog(r));return r}makeTex(e,t){let n=this.gl,r=n.createTexture();return n.bindTexture(n.TEXTURE_2D,r),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),{tex:r,w:e,h:t}}target(e,t,n){let r=this.gl,i=this.targets.get(e);if(i&&i.w===t&&i.h===n)return i;i&&r.deleteTexture(i.tex);let a=this.makeTex(t,n);return r.bindTexture(r.TEXTURE_2D,a.tex),r.texImage2D(r.TEXTURE_2D,0,r.RGBA,t,n,0,r.RGBA,r.UNSIGNED_BYTE,null),this.targets.set(e,a),a}dropTargets(){this.stackKey=``,this.stackTex=null;for(let e of this.targets.values())this.gl.deleteTexture(e.tex);this.targets.clear()}},Jt={hl:[0,1],sh:[0,1],tr:[0,1],grain:[0,1],grain_size:[0,1],grain_color:[0,1],grain_shadow:[0,1]};function Yt(e){if(!e||typeof e!=`object`)return;let t={};for(let[n,[r,i]]of Object.entries(Jt)){let a=e[n];typeof a==`number`&&Number.isFinite(a)&&(t[n]=Math.min(i,Math.max(r,a)))}return Object.keys(t).length?t:void 0}function Xt(e,t){if(!e||typeof e!=`object`)return{ok:!1,error:`Preset nie jest obiektem`};let n=e;if(n.schema_version!==1)return{ok:!1,error:`Nieobsługiwana wersja schematu: ${String(n.schema_version)}`};if(typeof n.id!=`string`||!n.id)return{ok:!1,error:`Brak id`};if(typeof n.name!=`string`||!n.name)return{ok:!1,error:`Brak nazwy`};let r=n.mix===void 0?1:n.mix;if(typeof r!=`number`||r<0||r>1)return{ok:!1,error:`mix musi być liczbą 0..1`};if(!Array.isArray(n.operations)||n.operations.length===0)return{ok:!1,error:`Brak operacji`};let i=[];for(let[e,r]of n.operations.entries()){let n=r,a=typeof n?.effect==`string`?t(n.effect):void 0;if(!a)return{ok:!1,error:`Operacja ${e}: nieznany efekt "${String(n?.effect)}"`};let o={},s=n.params??{};for(let t of a.params){let n=s[t.id];if(n===void 0)o[t.id]=t.default;else{if(typeof n!=`number`||!Number.isFinite(n))return{ok:!1,error:`Operacja ${e}: ${t.id} musi być liczbą`};o[t.id]=t.kind===`number`?Math.min(t.max,Math.max(t.min,n)):n}}i.push({effect:a.id,enabled:n.enabled!==!1,params:o})}return{ok:!0,preset:{schema_version:1,id:n.id,name:n.name,mix:r,author:typeof n.author==`string`?n.author:void 0,seed:typeof n.seed==`number`?n.seed:void 0,engine:Yt(n.engine),operations:i}}}var Zt=(e,t,n,r={})=>({schema_version:1,id:e,name:t,author:`LASTFRM3`,mix:1,operations:[{effect:`ghost_ir`,enabled:!0,params:{variant:n,...r}}]}),X=(e,t,n,r)=>({schema_version:1,id:t,name:n,author:`LASTFRM3`,mix:1,operations:[{effect:e,enabled:!0,params:r}]}),Z=(e,t,n)=>({...e,id:`${e.id}.${t.toLowerCase().replace(/\s+/g,`_`)}`,name:`${e.name} ${t}`,engine:n}),Qt=[X(`purple_film`,`lastfrm3.purple.soft`,`SOFT`,{sky_pink:.75,shift:.85,saturation:.5,shadow_purple:.35,highlight_pink:.3,contrast:.35,fade:.25,grain:.25}),X(`purple_film`,`lastfrm3.purple.deep`,`DEEP`,{sky_pink:0,shift:1,saturation:.8,shadow_purple:.7,highlight_pink:.5,contrast:.55,fade:.1,grain:.4}),X(`purple_film`,`lastfrm3.purple.sunset`,`SUNSET`,{sky_pink:1,shift:.9,saturation:.7,shadow_purple:.5,highlight_pink:.8,contrast:.45,fade:.3,grain:.3}),X(`noir`,`lastfrm3.noir.classic`,`CLASSIC`,{filter:0,tint:0,tint_amount:.3,contrast:.6,crush:.3,grain:.4,vignette:.3}),X(`noir`,`lastfrm3.noir.hard`,`HARD`,{filter:1,tint:0,tint_amount:.3,contrast:.9,crush:.6,grain:.6,vignette:.5}),X(`noir`,`lastfrm3.noir.red`,`RED NOIR`,{filter:1,tint:1,tint_amount:.35,contrast:.8,crush:.5,grain:.5,vignette:.45}),X(`noir`,`lastfrm3.noir.blue`,`BLUE HOUR`,{filter:0,tint:2,tint_amount:.4,contrast:.7,crush:.4,grain:.5,vignette:.4}),X(`noir`,`lastfrm3.noir.sepia`,`SEPIA`,{filter:2,tint:3,tint_amount:.5,contrast:.5,crush:.25,grain:.35,vignette:.3}),X(`prism_ghost`,`lastfrm3.prism.soft`,`SOFT`,{spread:.3,copies:2,angle:.08,rainbow:.4,blend:.5,focus:.6,fringe:.3}),X(`prism_ghost`,`lastfrm3.prism.ghost`,`GHOST`,{spread:.45,copies:4,angle:.08,rainbow:.6,blend:.7,focus:.5,fringe:.4}),X(`prism_ghost`,`lastfrm3.prism.rainbow`,`RAINBOW`,{spread:.6,copies:6,angle:0,rainbow:1,blend:.85,focus:.35,fringe:.7}),X(`glitch`,`lastfrm3.glitch.tear`,`TEAR`,{damage:.45,block_size:.25,scanlines:.2,displacement:.5,randomness:.5,seed:7}),X(`glitch`,`lastfrm3.glitch.blockrot`,`BLOCK ROT`,{damage:.7,block_size:.7,scanlines:.1,displacement:.6,randomness:.7,seed:21}),X(`glitch`,`lastfrm3.glitch.transmission`,`TRANSMISSION`,{damage:.35,block_size:.15,scanlines:.6,displacement:.35,randomness:.4,seed:3}),X(`glitch`,`lastfrm3.glitch.meltdown`,`MELTDOWN`,{damage:1,block_size:.5,scanlines:.4,displacement:1,randomness:.9,seed:99}),X(`unstable_film`,`lastfrm3.unstable.subtle`,`SUBTLE`,{stability:.7,color_drift:.4,damage:.15,randomness:.5,seed:1234}),X(`unstable_film`,`lastfrm3.unstable.drift`,`DRIFT`,{stability:.4,color_drift:.7,damage:.3,randomness:.6,seed:2077}),X(`unstable_film`,`lastfrm3.unstable.mutant`,`MUTANT`,{stability:.15,color_drift:.9,damage:.6,randomness:.8,seed:4821}),X(`double_exposure`,`lastfrm3.double.classic`,`DOUBLE EXPOSURE CLASSIC`,{mode:0,blend:.7,shadow_mask:.4,contrast:.3,mono:0}),X(`double_exposure`,`lastfrm3.double.silhouette`,`DOUBLE EXPOSURE SILHOUETTE`,{mode:0,blend:1,shadow_mask:.9,contrast:.55,mono:.5}),X(`double_exposure`,`lastfrm3.double.film`,`DOUBLE EXPOSURE FILM ADD`,{mode:1,blend:.5,shadow_mask:0,contrast:.2,mono:0}),X(`double_exposure`,`lastfrm3.double.dark`,`DOUBLE EXPOSURE DARK MIX`,{mode:4,blend:.85,shadow_mask:0,contrast:.3,mono:.3}),X(`azure`,`lastfrm3.azure.soft`,`AZURE SOFT`,{sky_shift:.7,foliage_cyan:.3,shadow_tint:.35,highlight_pink:.4,mutation:.15,grain:.25,halation:.25}),X(`azure`,`lastfrm3.azure.mutant`,`AZURE MUTANT`,{sky_shift:.9,foliage_cyan:.5,shadow_tint:.5,highlight_pink:.6,mutation:.3,grain:.4,halation:.4}),X(`azure`,`lastfrm3.azure.extreme`,`AZURE EXTREME`,{sky_shift:1,foliage_cyan:.9,shadow_tint:.8,highlight_pink:.9,mutation:.7,grain:.7,halation:.8}),X(`broken_rgb`,`lastfrm3.broken_rgb.split`,`SPLIT`,{channel_swap:0,red_offset:.5,green_offset:0,blue_offset:.5}),X(`broken_rgb`,`lastfrm3.broken_rgb.ghosts`,`GHOSTS`,{channel_swap:0,red_offset:.9,green_offset:.6,blue_offset:.9}),X(`broken_rgb`,`lastfrm3.broken_rgb.swap`,`SWAP`,{channel_swap:1,red_offset:.25,green_offset:0,blue_offset:.25}),X(`cyanotype`,`lastfrm3.cyanotype.classic`,`CLASSIC`,{blue_depth:.5,paper_white:.6,contrast:.4,texture:.35}),X(`cyanotype`,`lastfrm3.cyanotype.deep`,`DEEP`,{blue_depth:.9,paper_white:.5,contrast:.55,texture:.4}),X(`chrome_metropolis`,`lastfrm3.metropolis.city`,`METROPOLIS`,{saturation:.45,contrast:.6,teal_shadows:.6,peach_highlights:.5,green_to_teal:.5,fade:.2,grain:.35}),X(`chrome_metropolis`,`lastfrm3.metropolis.dark`,`DARK CITY`,{saturation:.35,contrast:.8,teal_shadows:.85,peach_highlights:.4,green_to_teal:.7,fade:.1,grain:.5}),X(`chrome_metropolis`,`lastfrm3.metropolis.soft`,`SOFT DAY`,{saturation:.55,contrast:.4,teal_shadows:.4,peach_highlights:.65,green_to_teal:.35,fade:.35,grain:.25}),X(`cinestill_800t`,`lastfrm3.cinestill.night`,`CINESTILL 800T NIGHT`,{tungsten_cast:.15,highlight_rolloff:.6,teal_shadows:.55,contrast:.45,saturation:.6,halation:.8,grain:.35}),X(`cinestill_800t`,`lastfrm3.cinestill.day`,`CINESTILL 800T DAYLIGHT`,{tungsten_cast:.8,highlight_rolloff:.5,teal_shadows:.6,contrast:.4,saturation:.55,halation:.35,grain:.3}),X(`cinestill_800t`,`lastfrm3.cinestill.neon`,`CINESTILL 800T NEON`,{tungsten_cast:.3,highlight_rolloff:.7,teal_shadows:.7,contrast:.55,saturation:.75,halation:1,grain:.4}),X(`c12`,`lastfrm3.c12.day`,`C-12 DAY`,{contrast:.5,shadow_cyan:.5,saturation:.55,black_level:.2,film_fade:.25,toxic:0}),X(`c12`,`lastfrm3.c12.night`,`C-12 NIGHT`,{contrast:.65,shadow_cyan:.8,saturation:.4,black_level:.1,film_fade:.15,toxic:0}),X(`c12`,`lastfrm3.c12.toxic`,`C-12 TOXIC`,{contrast:.55,shadow_cyan:.6,saturation:.7,black_level:.2,film_fade:.3,toxic:.8}),X(`tokyo_2099`,`lastfrm3.tokyo.night`,`NIGHT`,{neon_cyan:.7,magenta:.6,shadow_blue:.7,contrast:.5,glow:.5,intensity:1}),X(`tokyo_2099`,`lastfrm3.tokyo.day`,`DAY`,{neon_cyan:.4,magenta:.35,shadow_blue:.4,contrast:.4,glow:.2,intensity:1}),X(`solar_damage`,`lastfrm3.solar.mild`,`MILD`,{threshold:.6,inversion:.5,contrast:.3,color_bias:.55,intensity:1}),X(`solar_damage`,`lastfrm3.solar.classic`,`CLASSIC`,{threshold:.5,inversion:.8,contrast:.4,color_bias:.55,intensity:1}),X(`solar_damage`,`lastfrm3.solar.melt`,`MELT`,{threshold:.35,inversion:1,contrast:.6,color_bias:.2,intensity:1}),X(`expired_film`,`lastfrm3.expired.200`,`EXPIRED 200`,{fade:.3,color_cast:.3,grain:.3,contrast:.35,leaks:.1,intensity:1}),X(`expired_film`,`lastfrm3.expired.400`,`EXPIRED 400`,{fade:.45,color_cast:.5,grain:.5,contrast:.3,leaks:.3,intensity:1}),X(`expired_film`,`lastfrm3.expired.extreme`,`EXPIRED EXTREME`,{fade:.75,color_cast:.9,grain:.8,contrast:.25,leaks:.75,intensity:1}),X(`cyanotype`,`lastfrm3.cyanotype.bleached`,`BLEACHED`,{blue_depth:.25,paper_white:1,contrast:.3,texture:.25}),Zt(`lastfrm3.ghost_ir.mono`,`GHOST IR MONO`,0),Zt(`lastfrm3.ghost_ir.cyan`,`GHOST IR CYAN`,1,{bloom:.35}),Zt(`lastfrm3.ghost_ir.pink`,`GHOST IR PINK`,2,{foliage_white:.9,sky_darkness:.75})],Q=e=>Qt.find(t=>t.id===e),$t={hl:.7,sh:.35,tr:.6},en={hl:.5,sh:.3,tr:.4,grain:.35,grain_size:.4,grain_color:.25,grain_shadow:.2},tn=[...Qt,Z(Q(`lastfrm3.azure.soft`),`PROTECT`,$t),Z(Q(`lastfrm3.azure.mutant`),`PROTECT`,{hl:.8,sh:.4,tr:.7}),Z(Q(`lastfrm3.azure.mutant`),`FILM`,en),Z(Q(`lastfrm3.ghost_ir.mono`),`PROTECT`,{hl:.9,sh:.6,tr:.3}),Z(Q(`lastfrm3.ghost_ir.mono`),`FILM`,{hl:.7,sh:.45,grain:.3,grain_size:.45,grain_shadow:.35}),Z(Q(`lastfrm3.ghost_ir.pink`),`PROTECT`,{hl:.85,sh:.5,tr:.5}),Z(Q(`lastfrm3.purple.soft`),`PROTECT`,{hl:.6,sh:.3,tr:.8}),Z(Q(`lastfrm3.purple.sunset`),`PROTECT`,{hl:.65,sh:.3,tr:.8})],nn=[0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63],rn=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99],an=[17,18,24,47,99,99,99,99,18,21,26,66,99,99,99,99,24,26,56,99,99,99,99,99,47,66,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99],on=[0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0],sn=[0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0],cn=[0,1,2,3,4,5,6,7,8,9,10,11],ln=[0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,125],un=[1,2,3,0,4,17,5,18,33,49,65,6,19,81,97,7,34,113,20,50,129,145,161,8,35,66,177,193,21,82,209,240,36,51,98,114,130,9,10,22,23,24,25,26,37,38,39,40,41,42,52,53,54,55,56,57,58,67,68,69,70,71,72,73,74,83,84,85,86,87,88,89,90,99,100,101,102,103,104,105,106,115,116,117,118,119,120,121,122,131,132,133,134,135,136,137,138,146,147,148,149,150,151,152,153,154,162,163,164,165,166,167,168,169,170,178,179,180,181,182,183,184,185,186,194,195,196,197,198,199,200,201,202,210,211,212,213,214,215,216,217,218,225,226,227,228,229,230,231,232,233,234,241,242,243,244,245,246,247,248,249,250],dn=[0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,119],fn=[0,1,2,3,17,4,5,33,49,6,18,65,81,7,97,113,19,34,50,129,8,20,66,145,161,177,193,9,35,51,82,240,21,98,114,209,10,22,36,52,225,37,241,23,24,25,26,38,39,40,41,42,53,54,55,56,57,58,67,68,69,70,71,72,73,74,83,84,85,86,87,88,89,90,99,100,101,102,103,104,105,106,115,116,117,118,119,120,121,122,130,131,132,133,134,135,136,137,138,146,147,148,149,150,151,152,153,154,162,163,164,165,166,167,168,169,170,178,179,180,181,182,183,184,185,186,194,195,196,197,198,199,200,201,202,210,211,212,213,214,215,216,217,218,226,227,228,229,230,231,232,233,234,242,243,244,245,246,247,248,249,250];function pn(e,t){let n=[],r=0,i=0;for(let a=1;a<=16;a++){for(let o=0;o<e[a-1];o++)n[t[i++]]=[r++,a];r<<=1}return n}var mn=[1,1.387039845,1.306562965,1.175875602,1,.785694958,.5411961,.275899379];function hn(e,t){let n=t<50?5e3/t:200-t*2,r=e.map(e=>Math.min(255,Math.max(1,Math.floor((e*n+50)/100)))),i=new Float32Array(64);for(let e=0;e<8;e++)for(let t=0;t<8;t++)i[e*8+t]=1/(r[e*8+t]*mn[e]*mn[t]*8);return{q:r,f:i}}var gn=class{constructor(e,t,n=92){this.width=e,this.height=t,this.chunks=[],this.buf=new Uint8Array(1<<20),this.pos=0,this.bitBuf=0,this.bitCnt=0,this.rowsDone=0,this.finished=!1,this.dcY=pn(on,cn),this.dcC=pn(sn,cn),this.acY=pn(ln,un),this.acC=pn(dn,fn),this.pred=[0,0,0],this.blk=new Float32Array(64),this.quant=new Int32Array(64),this.qy=hn(rn,n),this.qc=hn(an,n),this.writeHeader()}pushRows(e,t){if(this.finished)throw Error(`Koder zamknięty`);let n=this.width;if(t%8!=0&&this.rowsDone+t!==this.height)throw Error(`Pas musi mieć wielokrotność 8 wierszy`);let r=Math.ceil(t/8),i=Math.ceil(n/8);for(let a=0;a<r;a++)for(let r=0;r<i;r++)for(let i=0;i<3;i++){for(let o=0;o<8;o++){let s=Math.min(t-1,a*8+o);for(let t=0;t<8;t++){let a=Math.min(n-1,r*8+t),c=(s*n+a)*4,l=e[c],u=e[c+1],d=e[c+2],f;f=i===0?.299*l+.587*u+.114*d-128:i===1?-.168736*l-.331264*u+.5*d:.5*l-.418688*u-.081312*d,this.blk[o*8+t]=f}}this.encodeBlock(i)}this.rowsDone+=t}finish(){if(this.rowsDone!==this.height)throw Error(`Zakodowano ${this.rowsDone} z ${this.height} wierszy`);return this.flushBits(!0),this.put(255),this.put(217),this.finished=!0,this.flushBuf(),new Blob(this.chunks,{type:`image/jpeg`})}encodeBlock(e){let t=this.blk;for(let e=0;e<2;e++){let n=e===0?1:8,r=e===0?8:1;for(let e=0;e<8;e++){let i=e*r,a=t[i],o=t[i+n],s=t[i+2*n],c=t[i+3*n],l=t[i+4*n],u=t[i+5*n],d=t[i+6*n],f=t[i+7*n],p=a+f,m=a-f,h=o+d,g=o-d,_=s+u,v=s-u,y=c+l,b=c-l,x=p+y,S=p-y,C=h+_,w=h-_;t[i]=x+C,t[i+4*n]=x-C;let T=(w+S)*.707106781;t[i+2*n]=S+T,t[i+6*n]=S-T,x=b+v,C=v+g;let E=g+m,D=(x-E)*.382683433,O=.5411961*x+D,k=1.306562965*E+D,A=C*.707106781,j=m+A,M=m-A;t[i+5*n]=M+O,t[i+3*n]=M-O,t[i+n]=j+k,t[i+7*n]=j-k}}let n=e===0?this.qy:this.qc;for(let e=0;e<64;e++){let r=t[e]*n.f[e];this.quant[e]=r>0?r+.5|0:r-.5|0}let r=e===0?this.dcY:this.dcC,i=e===0?this.acY:this.acC,a=this.quant[0]-this.pred[e];this.pred[e]=this.quant[0],this.emitMagnitude(a,r);let o=0;for(let e=1;e<64;e++){let t=this.quant[nn[e]];if(t===0){o++;continue}for(;o>15;)this.writeCode(i[240]),o-=16;let n=_n(t);this.writeCode(i[o<<4|n]),this.writeBits(t<0?t-1:t,n),o=0}o>0&&this.writeCode(i[0])}emitMagnitude(e,t){let n=_n(e);this.writeCode(t[n]),n&&this.writeBits(e<0?e-1:e,n)}writeCode(e){this.writeBits(e[0],e[1])}writeBits(e,t){for(this.bitBuf=this.bitBuf<<t|e&(1<<t)-1,this.bitCnt+=t;this.bitCnt>=8;){let e=this.bitBuf>>>this.bitCnt-8&255;this.put(e),e===255&&this.put(0),this.bitCnt-=8}this.bitBuf&=(1<<this.bitCnt)-1}flushBits(e){e&&this.bitCnt>0&&this.writeBits(127,8-this.bitCnt)}put(e){this.pos===this.buf.length&&this.flushBuf(),this.buf[this.pos++]=e}flushBuf(){this.pos&&=(this.chunks.push(this.buf.slice(0,this.pos)),0)}writeHeader(){let e=e=>{this.put(e>>8),this.put(e&255)};this.put(255),this.put(216),this.put(255),this.put(224),e(16),[74,70,73,70,0,1,1,0].forEach(e=>this.put(e)),e(1),e(1),this.put(0),this.put(0);for(let[t,n]of[[0,this.qy.q],[1,this.qc.q]]){this.put(255),this.put(219),e(67),this.put(t);for(let e=0;e<64;e++)this.put(n[nn[e]])}this.put(255),this.put(192),e(17),this.put(8),e(this.height),e(this.width),this.put(3),[[1,17,0],[2,17,1],[3,17,1]].forEach(([e,t,n])=>{this.put(e),this.put(t),this.put(n)});let t=(t,n,r,i)=>{this.put(255),this.put(196),e(19+i.length),this.put(t<<4|n),r.forEach(e=>this.put(e)),i.forEach(e=>this.put(e))};t(0,0,on,cn),t(1,0,ln,un),t(0,1,sn,cn),t(1,1,dn,fn),this.put(255),this.put(218),e(12),this.put(3),[[1,0],[2,17],[3,17]].forEach(([e,t])=>{this.put(e),this.put(t)}),this.put(0),this.put(63),this.put(0)}};function _n(e){let t=e<0?-e:e,n=0;for(;t;)n++,t>>=1;return n}function vn(e){if(e.length<4||e[0]!==255||e[1]!==216)return null;let t=1,n=0,r=0,i=2;for(;i+4<=e.length;){if(e[i]!==255){i++;continue}let a=e[i+1];if(a===255){i++;continue}if(a===216||a>=208&&a<=215||a===1){i+=2;continue}let o=e[i+2]<<8|e[i+3],s=i+4;if(a===225&&e[s]===69&&e[s+1]===120&&e[s+2]===105&&e[s+3]===102){let n=s+6,r=e[n]===73,i=t=>r?e[t]|e[t+1]<<8:e[t]<<8|e[t+1],a=n+(t=>r?(e[t]|e[t+1]<<8|e[t+2]<<16|e[t+3]<<24)>>>0:(e[t]<<24|e[t+1]<<16|e[t+2]<<8|e[t+3])>>>0)(n+4);if(a+2<=e.length){let n=i(a);for(let r=0;r<n;r++){let n=a+2+r*12;if(n+12>e.length)break;if(i(n)===274){let e=i(n+8);e>=1&&e<=8&&(t=e)}}}}if(a>=192&&a<=207&&a!==196&&a!==200&&a!==204){r=e[s+1]<<8|e[s+2],n=e[s+3]<<8|e[s+4];break}i+=2+o}return n&&r?{width:n,height:r,orientation:t}:{width:0,height:0,orientation:t}}async function yn(e){return vn(new Uint8Array(await e.slice(0,1<<20).arrayBuffer()))}var bn=null;async function xn(){let e=new gn(8,8,95),t=new Uint8Array(256);for(let e=0;e<8;e++)for(let n=0;n<8;n++){let r=(e*8+n)*4;t[r]=n<4?255:0,t[r+2]=n<4?0:255,t[r+3]=255}e.pushRows(t,8);let n=new Uint8Array(await e.finish().arrayBuffer()),r=new Uint8Array([255,225,0,34,69,120,105,102,0,0,77,77,0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,2,0,0,0,0,0,0]),i=new Uint8Array(n.length+r.length);return i.set(n.subarray(0,2),0),i.set(r,2),i.set(n.subarray(2),2+r.length),new Blob([i],{type:`image/jpeg`})}function Sn(){return bn||=(async()=>{try{let e=await $(await xn()),t=document.createElement(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`,{willReadFrequently:!0});n.drawImage(e,0,0);let r=n.getImageData(1,4,1,1).data;return e.close(),r[2]>r[0]}catch{return!1}})(),bn}async function $(e){try{return await createImageBitmap(e,{imageOrientation:`none`,colorSpaceConversion:`default`})}catch{return await createImageBitmap(e)}}async function Cn(e){return!e||e.orientation===1||await Sn()?1:e.orientation}function wn(e,t){let n=e*374761393+t*668265263|0;return n=(n^n>>>13)*1274126177,((n^n>>>16)>>>0)/4294967295}function Tn(e,t,n){let r=Math.floor(e/n),i=Math.floor(t/n);return wn(r,i)*.6+wn(r*3+1,i*5+2)*.4}var En=[[.78,.38,.2,[46,112,34]],[.6,.5,.14,[70,140,52]],[.93,.5,.15,[38,96,30]],[.5,.6,.07,[88,150,60]],[.3,.66,.05,[60,128,44]]];function Dn(e,t){let n=new Uint8ClampedArray(e*t*4),r=e/t;for(let i=0;i<t;i++)for(let a=0;a<e;a++){let o=a/e,s=i/t,c,l,u,d=Math.min(1,s/.62);c=40+d*110,l=95+d*100,u=205+d*40;for(let[e,t,n,r]of[[.25,.12,.14,.04],[.45,.2,.1,.03],[.62,.08,.12,.035]]){let i=Math.hypot((o-e)/n,(s-t)/r),a=Math.max(0,1-i)*1.2,d=Math.min(1,a);c+=(245-c)*d,l+=(247-l)*d,u+=(250-u)*d}if(o>.06&&o<.44&&s>.22&&s<.66){let e=.9+.1*Math.sin(s*60);c=172*e,l=166*e,u=158*e;let t=(o-.08)*40%1,n=(s-.26)*28%1;t>.2&&t<.8&&n>.2&&n<.75&&s<.62&&(c=62,l=84,u=108)}if(s>.64){let e=.7+.5*Tn(a,i,3);c=62*e,l=128*e,u=40*e;let t=.5+(s-.64)*.9;Math.abs(o-t)<.03+(s-.64)*.25&&(c=196,l=176,u=138)}for(let[e,t,n,d]of En){let f=Math.hypot((o-e)*r,s-t);if(f<n){let e=.55+.75*Tn(a,i,4)-f*.8;c=d[0]*e,l=d[1]*e,u=d[2]*e}Math.abs(o-e)*r<.008&&s>t+n*.7&&s<.7&&(c=78,l=56,u=40)}Math.hypot((o-.22)*r,s-.58)<.032?(c=226,l=176,u=148):Math.abs(o-.22)*r<.045&&s>.615&&s<.78?(c=52,l=82,u=165):Math.abs(o-.22)*r<.04&&s>=.78&&s<.92&&(c=48,l=46,u=52);let f=(wn(a,i)-.5)*8,p=(i*e+a)*4;n[p]=c+f,n[p+1]=l+f,n[p+2]=u+f,n[p+3]=255}return n}var On=64;async function kn(e,t,n){if(t.kind===`sample`){e.loadLayer(t.canvas,t.canvas.width,t.canvas.height,1,n);return}let r=await $(t.file);try{e.loadLayer(r,r.width,r.height,t.orientation,n)}finally{r.close()}}async function An(e,t,n,r,i,a,o,s,c){let l=[1/0,8192,6144,4096],u=null;for(let d=0;d<l.length;d++){let f=document.createElement(`canvas`),p=qt.create(f);if(!p)throw Error(`Brak WebGL2 — eksport w pełnej rozdzielczości niedostępny.`);p.setFinish(s??null),p.setPre(c??[]);try{let s=await $(e),c;try{c=p.loadSource(s,s.width,s.height,t,l[d])}finally{s.close()}o&&(await kn(p,o.layer,Math.min(l[d],Math.max(c.width,c.height))),p.applyCompose(o.def,o.params));let u=new gn(c.width,c.height,Math.round(i*100));await p.exportStrips(n,r,On,(e,t)=>u.pushRows(e,t),a);let f=u.finish(),m=d===0;return{blob:f,width:c.width,height:c.height,fullResolution:m,note:m?`Pełna rozdzielczość: ${c.width}×${c.height}`:`UWAGA: zmniejszono do ${c.width}×${c.height} (ograniczenie pamięci/GPU urządzenia)`}}catch(e){u=e}finally{p.dispose(),f.width=0,f.height=0}}throw u instanceof Error?u:Error(`Eksport nieudany`)}async function jn(e,t,n,r,i,a,o,s){let c=document.createElement(`canvas`),l=qt.create(c);if(!l)throw Error(`Brak WebGL2`);l.setFinish(o??null),l.setPre(s??[]);try{let o=l.loadSource(e,e.width,e.height,1,1/0);a&&(await kn(l,a.layer,Math.max(o.width,o.height)),l.applyCompose(a.def,a.params));let s=new gn(o.width,o.height,Math.round(r*100));return await l.exportStrips(t,n,On,(e,t)=>s.pushRows(e,t),i),{blob:s.finish(),width:o.width,height:o.height,fullResolution:!0,note:`${o.width}×${o.height}`}}finally{l.dispose()}}async function Mn(e,t){let n=window;if(n.showSaveFilePicker)try{let r=await(await n.showSaveFilePicker({id:`lf3-export`,suggestedName:t,startIn:`pictures`,types:[{description:`JPEG`,accept:{"image/jpeg":[`.jpg`,`.jpeg`]}}]})).createWritable();return await r.write(e),await r.close(),`saved`}catch(e){if(e.name===`AbortError`)return`cancelled`}let r=URL.createObjectURL(e),i=document.createElement(`a`);return i.href=r,i.download=t,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(r),6e4),`downloaded`}function Nn(){let e=navigator;try{return!!e.canShare?.({files:[new File([new Blob([`x`])],`x.jpg`,{type:`image/jpeg`})]})}catch{return!1}}async function Pn(e,t){let n=new File([e],t,{type:`image/jpeg`}),r=navigator;if(r.canShare?.({files:[n]}))try{return await r.share({files:[n]}),`shared`}catch(e){if(e.name===`AbortError`)return`cancelled`}let i=URL.createObjectURL(e),a=document.createElement(`a`);return a.href=i,a.download=t,document.body.appendChild(a),a.click(),a.remove(),setTimeout(()=>URL.revokeObjectURL(i),6e4),`downloaded`}function Fn(e,t){let n=document.createElement(`canvas`);n.width=e,n.height=t;let r=n.getContext(`2d`),i=r.createLinearGradient(0,0,0,t);i.addColorStop(0,`#0a1a2a`),i.addColorStop(.55,`#3b6c7c`),i.addColorStop(1,`#e9c79a`),r.fillStyle=i,r.fillRect(0,0,e,t);let a=e*.66,o=t*.3,s=t*.17,c=r.createRadialGradient(a,o,s*.8,a,o,s*3);c.addColorStop(0,`rgba(255,240,200,0.55)`),c.addColorStop(1,`rgba(255,240,200,0)`),r.fillStyle=c,r.fillRect(0,0,e,t);let l=r.createRadialGradient(a-s*.3,o-s*.3,s*.1,a,o,s);l.addColorStop(0,`#fffaf0`),l.addColorStop(1,`#ecd8aa`),r.fillStyle=l,r.beginPath(),r.arc(a,o,s,0,Math.PI*2),r.fill();let u=7,d=()=>(u=u*1103515245+12345&2147483647,u/2147483647);for(let n=0;n<3;n++){r.fillStyle=[`#2c4a52`,`#142a31`,`#050a0d`][n];let i=t*(.78+n*.07),a=26+n*10;for(let o=0;o<a;o++){let s=(o+d()*.6)/a*e,c=t*(.14+d()*.16)*(1+n*.25),l=c*.28;r.beginPath(),r.moveTo(s,i-c),r.lineTo(s-l,i),r.lineTo(s+l,i),r.closePath(),r.fill()}r.fillRect(0,i-2,e,t-i+2)}return n}var In=class{constructor(e){this.canvas=e,this.r=null,this.w=0,this.h=0,this.cx=0,this.cy=0,this.full=!0}get ready(){return this.r!==null}async open(e,t,n){this.dispose();let r=[1/0,8192,6144,4096],i=null;for(let a=0;a<r.length;a++){let o=qt.create(this.canvas);if(!o)throw Error(`Brak WebGL2`);try{let i=await $(e),s;try{s=o.loadSource(i,i.width,i.height,t,r[a])}finally{i.close()}n&&await kn(o,n.layer,Math.min(r[a],Math.max(s.width,s.height))),this.r=o,this.w=s.width,this.h=s.height,this.full=a===0,this.cx=this.w/2,this.cy=this.h/2;return}catch(e){i=e,o.dispose()}}throw i instanceof Error?i:Error(`Lupa: brak pamięci GPU`)}pan(e,t,n,r){this.cx-=e,this.cy-=t,this.clamp(n,r)}clamp(e,t){this.cx=this.w<=e?this.w/2:Math.min(this.w-e/2,Math.max(e/2,this.cx)),this.cy=this.h<=t?this.h/2:Math.min(this.h-t/2,Math.max(t/2,this.cy))}setCenterFraction(e,t){this.cx=e*this.w,this.cy=t*this.h}draw(e,t,n,r,i,a,o=[]){let s=this.r;s&&(i=Math.min(i,this.w),a=Math.min(a,this.h),this.clamp(i,a),s.setFinish(n),s.setPre(o),r?s.applyCompose(r.def,r.params):s.applyCompose(null,null),s.renderRegion(e,t,Math.round(this.cx-i/2),Math.round(this.cy-a/2),i,a))}dispose(){this.r?.dispose(),this.r=null}},Ln={double_exposure:[`blend`,`scale`,`shadow_mask`],ghost_ir:[`foliage_white`,`sky_darkness`,`ir_contrast`],azure:[`sky_shift`,`foliage_cyan`,`highlight_pink`,`grain`],purple_film:[`shift`,`sky_pink`,`saturation`,`grain`],prism_ghost:[`spread`,`copies`,`rainbow`,`blend`],broken_rgb:[`red_offset`,`green_offset`,`blue_offset`,`intensity`],cyanotype:[`blue_depth`,`paper_white`,`contrast`],noir:[`tint_amount`,`contrast`,`crush`,`grain`],chrome_metropolis:[`saturation`,`contrast`,`teal_shadows`,`grain`],cinestill_800t:[`tungsten_cast`,`highlight_rolloff`,`halation`,`grain`],c12:[`contrast`,`shadow_cyan`,`saturation`,`film_fade`],tokyo_2099:[`neon_cyan`,`magenta`,`glow`,`intensity`],solar_damage:[`threshold`,`inversion`,`contrast`,`intensity`],expired_film:[`fade`,`color_cast`,`grain`,`leaks`],glitch:[`damage`,`block_size`,`displacement`],unstable_film:[`stability`,`color_drift`,`damage`]},Rn={double_exposure:`<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>`,ghost_ir:`<path d="M6 21V11a6 6 0 0 1 12 0v10l-3-2-3 2-3-2z"/><circle cx="10" cy="11" r="1"/><circle cx="14" cy="11" r="1"/>`,azure:`<path d="M3 15c3-5 6-5 9 0s6 5 9 0"/><path d="M3 9c3-5 6-5 9 0s6 5 9 0"/>`,broken_rgb:`<rect x="4" y="6" width="11" height="11"/><rect x="9" y="9" width="11" height="11" opacity=".6"/>`,cyanotype:`<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>`,chrome_metropolis:`<path d="M4 21V9h5v12M9 21V4h6v17M15 21v-9h5v9M3 21h18"/>`,cinestill_800t:`<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>`,c12:`<rect x="4" y="4" width="16" height="16"/><path d="M12 4v16M4 12h8" /><path d="M4 4l8 8M12 12l8 8" opacity=".5"/>`,tokyo_2099:`<path d="M5 20V8M9 20V4M13 20V10M17 20V6M21 20V12"/>`,solar_damage:`<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/><path d="M12 8a4 4 0 0 1 0 8z" fill="currentColor"/>`,expired_film:`<rect x="3" y="5" width="18" height="14"/><path d="M3 9h18M3 15h18M7 5v4M12 5v4M17 5v4M7 15v4M12 15v4M17 15v4"/>`,glitch:`<path d="M3 6h12M9 10h12M3 14h8M13 14h8M6 18h12"/>`,purple_film:`<path d="M12 3c-4 4-6 7-6 10a6 6 0 0 0 12 0c0-3-2-6-6-10z"/><path d="M12 8c-2 2-3 4-3 6" opacity=".6"/>`,prism_ghost:`<path d="M12 4l8 14H4z"/><path d="M2 12h6M16 10l6-2M16 13l6 1M16 16l6 4" opacity=".7"/>`,noir:`<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>`,unstable_film:`<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>`},zn=`<circle cx="12" cy="12" r="7"/>`;function Bn(e){return`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Rn[e]??zn}</svg>`}var Vn=`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>`,Hn=`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,Un=e=>`lf3:${e}:params:v1`,Wn=`lf3:fx:v1`,Gn=`lf3:userpresets:v1`,Kn=`lf3:locks:v1`,qn=`lf3:engine:v1`,Jn=`lf3:favs:v1`,Yn=`lf3:stack:v1`,Xn=3,Zn={undo:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -5)"/></svg>`,redo:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -5)"/></svg>`,split:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14"/><path d="M12 3v18"/><path d="M3 5h9v14H3z" fill="currentColor" fill-opacity=".3"/></svg>`,loupe:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/><path d="M10 7.5v5M7.5 10h5"/></svg>`},Qn=e=>`lf3:${e}:seeds:v1`,$n=.95,er=`
<div class="lf3 lf3-app">
  <header class="lf3-top">
    <div class="lf3-logo">LASTFRM<b>3</b><span>// DARKROOM</span></div>
    <div class="lf3-meta" data-ref="meta">—</div>
  </header>
  <main class="lf3-stage" data-ref="stage">
    <canvas class="lf3-canvas" data-ref="canvas"></canvas>
    <i class="lf3-corner lf3-tl"></i><i class="lf3-corner lf3-tr"></i><i class="lf3-corner lf3-bl"></i><i class="lf3-corner lf3-br"></i>
    <div class="lf3-badge" data-ref="badge" hidden>BEFORE</div>
    <canvas class="lf3-canvas lf3-before" data-ref="beforeCv" hidden></canvas>
    <div class="lf3-split" data-ref="splitLine" hidden><b>BEFORE</b><i data-ref="splitHandle"></i><b>AFTER</b></div>
    <canvas class="lf3-loupe" data-ref="loupeCv" hidden></canvas>
    <div class="lf3-hist" data-ref="hist" hidden>
      <button class="lf3-tool" data-act="undo" data-ref="undoBtn" aria-label="Cofnij" disabled>${Zn.undo}</button>
      <button class="lf3-tool" data-act="redo" data-ref="redoBtn" aria-label="Ponów" disabled>${Zn.redo}</button>
    </div>
    <div class="lf3-tools" data-ref="tools" hidden>
      <button class="lf3-tool lf3-focusbtn" data-act="focus" data-ref="focusBtn" aria-label="Pełny ekran zdjęcia" hidden>${Hn}</button>
      <button class="lf3-tool" data-act="split" data-ref="splitBtn" aria-label="Przed / po">${Zn.split}</button>
      <button class="lf3-tool" data-act="loupe" data-ref="loupeBtn" aria-label="Lupa 100%">${Zn.loupe}</button>
    </div>
    <button class="lf3-focusexit" data-act="unfocus" data-ref="focusExit" aria-label="Zamknij pełny ekran" hidden>✕</button>
    <div class="lf3-focushint" data-ref="focusHint" hidden>DOTKNIJ = POWRÓT · PRZYTRZYMAJ = ORYGINAŁ · SZCZYPNIJ = ZOOM</div>
    <div class="lf3-empty" data-ref="empty">
      <div class="lf3-empty-title" data-ref="emptyTitle">GHOST IR</div>
      <p>Wczytaj zdjęcie JPEG. Obróbka odbywa się lokalnie na urządzeniu — nic nie jest wysyłane.</p>
      <div class="lf3-row">
        <button class="lf3-btn lf3-primary" data-act="import">IMPORT</button>
        <button class="lf3-btn" data-act="sample">SAMPLE</button>
      </div>
      <small class="lf3-diag" data-ref="diag"></small>
    </div>
    <div class="lf3-busy" data-ref="busy" hidden>
      <div class="lf3-busy-text" data-ref="busyText">…</div>
      <div class="lf3-bar"><i data-ref="busyBar"></i></div>
    </div>
  </main>
  <div class="lf3-rail" data-ref="rail">
    <div class="lf3-railwrap" data-ref="railwrap"><div class="lf3-fxrow" data-ref="fx"></div></div>
    <button class="lf3-allfx" data-act="all-fx">${Vn}<span>ALL FX</span></button>
    <div class="lf3-railbar"><i data-ref="railthumb"></i></div>
  </div>
  <section class="lf3-panel">
    <div class="lf3-layerbar" data-ref="layerbar" hidden>
      <span class="lf3-layer-info" data-ref="layerInfo"></span>
      <button class="lf3-btn" data-act="import-b" data-ref="btnLoadB">WCZYTAJ B</button>
      <button class="lf3-btn" data-act="sample-b" data-ref="btnSampleB">SAMPLE B</button>
      <button class="lf3-btn" data-act="clear-b" data-ref="btnClearB">USUŃ B</button>
    </div>
    <div class="lf3-seedbar" data-ref="seedbar" hidden>
      <button class="lf3-btn" data-act="gen-variant">GENERATE VARIANT</button>
      <button class="lf3-btn" data-act="lock-variant" data-ref="btnLock">LOCK VARIANT</button>
      <button class="lf3-btn" data-act="save-seed">SAVE SEED</button>
      <button class="lf3-btn" data-act="save-preset">SAVE AS PRESET</button>
      <div class="lf3-seedlist" data-ref="seedlist"></div>
    </div>
    <div class="lf3-stackbar" data-ref="stackbar"></div>
    <div class="lf3-chips" data-ref="chips"></div>
    <div class="lf3-enums" data-ref="enums"></div>
    <div class="lf3-sliders" data-ref="sliders"></div>
    <details class="lf3-more" data-ref="more">
      <summary><span data-ref="moreLabel">MORE</span><button class="lf3-pill" data-act="engine-toggle" data-ref="engPill">ENGINE · OFF</button></summary>
      <div class="lf3-sliders" data-ref="moreSliders"></div>
      <div class="lf3-engine-head">ENGINE</div>
      <div class="lf3-engine-body" data-ref="engineBody"></div>
      <button class="lf3-btn lf3-engine-reset" data-act="engine-reset">RESET ENGINE</button>
    </details>
  </section>
  <nav class="lf3-nav">
    <button class="lf3-btn" data-act="import">IMPORT</button>
    <button class="lf3-btn" data-ref="compare" disabled>HOLD: BEFORE</button>
    <button class="lf3-btn lf3-primary" data-act="export" disabled>EXPORT</button>
  </nav>
  <div class="lf3-result" data-ref="result" hidden>
    <div class="lf3-result-card">
      <img data-ref="resultImg" alt="Wynik eksportu" />
      <div class="lf3-result-info" data-ref="resultInfo"></div>
      <p class="lf3-result-hint">Na iPhonie: UDOSTĘPNIJ → „Zapisz obraz”, albo przytrzymaj podgląd i wybierz „Dodaj do Zdjęć”.</p>
      <div class="lf3-row">
        <button class="lf3-btn lf3-primary" data-act="save-disk">ZAPISZ NA DYSK</button>
        <button class="lf3-btn" data-act="save" data-ref="shareBtn">UDOSTĘPNIJ</button>
        <button class="lf3-btn" data-act="close-result">ZAMKNIJ</button>
      </div>
    </div>
  </div>
  <div class="lf3-allsheet" data-ref="allsheet" hidden>
    <div class="lf3-allhead"><span>ALL FX</span><button class="lf3-btn" data-act="close-all">ZAMKNIJ</button></div>
    <div class="lf3-allgrid" data-ref="allgrid"></div>
  </div>
  <div class="lf3-toast" data-ref="toast" hidden></div>
  <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-ref="file" />
</div>`,tr=class{constructor(e){this.ctx2d=null,this.cpuSrc=null,this.effect=W(`ghost_ir`),this.source=null,this.layer=null,this.layerName=``,this.layerSize=``,this.composeDef=W(`double_exposure`),this.pickingLayer=!1,this.fin=Lt(),this.finBypass=!1,this.stack=[`ghost_ir`],this.lastSel=0,this.pcache=new Map,this.split=!1,this.splitPos=.5,this.beforeDirty=!0,this.hist=[],this.hi=-1,this.histTimer=0,this.restoring=!1,this.loupe=null,this.loupeOn=!1,this.loupeRaf=0,this.thumbs=new Map,this.thumbGen=0,this.fileName=`LASTFRM3`,this.busy=!1,this.raf=0,this.showingBefore=!1,this.toastTimer=0,this.lastResult=null,this.previewMax=window.innerWidth>900?2048:1600,this.focus=!1,this.zoom={s:1,tx:0,ty:0},e.innerHTML=er,this.root=e.querySelector(`.lf3-app`),this.canvas=this.ref(`canvas`),this.effect=this.loadEffect(),this.params=this.loadParams(this.effect),this.composeParams=this.effect.stage===`compose`?{...this.params}:this.loadParams(this.composeDef),this.fin=this.loadFinish(),this.stack=this.loadStack(),this.renderer=qt.create(this.canvas),this.renderer?this.renderer.onContextRestored=()=>{this.reloadSource()}:this.ctx2d=this.canvas.getContext(`2d`,{willReadFrequently:!0}),this.buildPanel(),this.bind(),this.ref(`diag`).textContent=this.diagnostics()}ref(e){return this.root.querySelector(`[data-ref="${e}"]`)}diagnostics(){if(!this.renderer)return`WebGL2 niedostępne — tryb awaryjny CPU (wolniejszy, eksport ograniczony).`;let e=this.renderer.gl,t=e.getExtension(`WEBGL_debug_renderer_info`),n=t?String(e.getParameter(t.UNMASKED_RENDERER_WEBGL)):`GPU`;return`WebGL2 OK · max tekstura ${this.renderer.maxTextureSize}px · ${n}`}loadEffect(){try{let e=localStorage.getItem(Wn),t=e?W(e):void 0;if(t)return t}catch{}return W(`ghost_ir`)}loadStack(){let e=[];try{let t=JSON.parse(localStorage.getItem(Yn)??`[]`);Array.isArray(t)&&(e=t.filter(e=>typeof e==`string`&&!!W(e)&&W(e).stage!==`compose`))}catch{}return e=[...new Set(e)].slice(0,Xn),this.effect.stage!==`compose`&&!e.includes(this.effect.id)&&(e=[this.effect.id]),e.length||(e=[`ghost_ir`]),this.lastSel=Math.max(0,e.indexOf(this.effect.id)),e}saveStack(){try{localStorage.setItem(Yn,JSON.stringify(this.stack))}catch{}this.pushHistory()}paramsFor(e){if(e===this.effect.id)return this.params;let t=this.pcache.get(e);return t||(t=this.loadParams(W(e)),this.pcache.set(e,t)),t}layers(){return this.stack.map(e=>({effect:W(e),params:this.paramsFor(e)}))}switchActive(e){if(e!==this.effect){this.effect.stage===`compose`?this.composeParams={...this.params}:(this.pcache.set(this.effect.id,{...this.params}),this.lastSel=Math.max(0,this.stack.indexOf(this.effect.id))),this.effect=e,this.params=e.stage===`compose`?{...this.composeParams}:this.loadParams(e),e.stage!==`compose`&&this.pcache.delete(e.id);try{localStorage.setItem(Wn,e.id)}catch{}this.buildPanel(),this.requestRender(),this.pushHistory(),this.canvas.classList.remove(`lf3-swap`),this.canvas.offsetWidth,this.canvas.classList.add(`lf3-swap`)}}setEffect(e){let t=W(e);if(!t||t===this.effect)return;if(t.stage===`compose`||this.stack.includes(e)){this.switchActive(t);return}let n=this.effect.stage===`compose`?this.lastSel:this.stack.indexOf(this.effect.id);this.stack[Math.max(0,Math.min(n,this.stack.length-1))]=e,this.saveStack(),this.switchActive(t)}addEffect(e){let t=W(e);if(t&&t.stage!==`compose`){if(!this.stack.includes(e)){if(this.stack.length>=Xn){this.toast(`Maksymalnie ${Xn} efekty w stosie.`,`warn`);return}this.stack.push(e),this.saveStack()}t===this.effect?(this.buildPanel(),this.requestRender()):this.switchActive(t)}}removeFromStack(e){if(this.stack.length<=1)return;let t=this.stack.indexOf(e);t<0||(this.stack.splice(t,1),this.pcache.delete(e),this.saveStack(),this.effect.id===e?this.switchActive(W(this.stack[Math.min(t,this.stack.length-1)])):(this.buildPanel(),this.requestRender()))}moveInStack(e,t){let n=this.stack.indexOf(e),r=n+t;n<0||r<0||r>=this.stack.length||([this.stack[n],this.stack[r]]=[this.stack[r],this.stack[n]],this.saveStack(),this.buildStackBar(),this.requestRender())}buildStackBar(){let e=this.ref(`stackbar`);e.innerHTML=``;let t=this.effect.stage===`compose`;if(this.stack.forEach((n,r)=>{let i=W(n),a=!t&&n===this.effect.id,o=document.createElement(`button`);if(o.className=`lf3-layer`+(a?` lf3-on`:``),o.innerHTML=`<em>${r+1}</em><span>${i.name}</span>`,o.addEventListener(`click`,()=>this.setEffect(n)),this.stack.length>1){if(a)for(let[e,t]of[[`‹`,-1],[`›`,1]]){let i=document.createElement(`i`);i.className=`lf3-mv`,i.textContent=e,(t<0&&r===0||t>0&&r===this.stack.length-1)&&i.classList.add(`lf3-off`),i.addEventListener(`click`,e=>{e.stopPropagation(),this.moveInStack(n,t)}),o.appendChild(i)}let e=document.createElement(`i`);e.className=`lf3-x`,e.textContent=`×`,e.addEventListener(`click`,e=>{e.stopPropagation(),this.removeFromStack(n)}),o.appendChild(e)}e.appendChild(o)}),this.stack.length<Xn){let t=document.createElement(`button`);t.className=`lf3-layer lf3-addfx`,t.textContent=`+ FX`,t.addEventListener(`click`,()=>this.openAllFx(!0)),e.appendChild(t)}}loadParams(e){let t=kt(e);try{let n=localStorage.getItem(Un(e.id));if(n){let r=JSON.parse(n);for(let n of e.params){let e=r[n.id];typeof e==`number`&&Number.isFinite(e)&&(t[n.id]=e)}}}catch{}return t}saveParams(){try{localStorage.setItem(Un(this.effect.id),JSON.stringify(this.params))}catch{}this.pushHistory()}toast(e,t=`ok`,n=4500){let r=this.ref(`toast`);r.textContent=e,r.dataset.kind=t,r.hidden=!1,clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>{r.hidden=!0},n)}setBusy(e,t=``,n=0){this.busy=e,this.ref(`busy`).hidden=!e,this.ref(`busyText`).textContent=t,this.ref(`busyBar`).style.width=`${Math.round(n*100)}%`}readFavs(){try{let e=JSON.parse(localStorage.getItem(Jn)??`[]`);return new Set(Array.isArray(e)?e.filter(e=>typeof e==`string`):[])}catch{return new Set}}toggleFav(e){let t=this.readFavs();t.delete(e)||t.add(e);try{localStorage.setItem(Jn,JSON.stringify([...t]))}catch{}this.buildPanel()}snap(){return{fx:this.effect.id,params:{...this.params},compose:this.effect.stage===`compose`?{...this.params}:{...this.composeParams},fin:{...this.fin},bypass:this.finBypass,stack:[...this.stack],layers:Object.fromEntries(this.stack.map(e=>[e,{...this.paramsFor(e)}]))}}pushHistory(){!this.restoring&&this.source&&(window.clearTimeout(this.histTimer),this.histTimer=window.setTimeout(()=>this.flushHistory(),350))}flushHistory(){if(!this.histTimer)return;window.clearTimeout(this.histTimer),this.histTimer=0;let e=this.snap(),t=this.hist[this.hi];t&&JSON.stringify(t)===JSON.stringify(e)||(this.hist=this.hist.slice(0,this.hi+1),this.hist.push(e),this.hist.length>60&&this.hist.shift(),this.hi=this.hist.length-1,this.updateHistButtons())}resetHistory(){window.clearTimeout(this.histTimer),this.histTimer=0,this.hist=[this.snap()],this.hi=0,this.updateHistButtons()}updateHistButtons(){this.ref(`undoBtn`).disabled=this.hi<=0,this.ref(`redoBtn`).disabled=this.hi>=this.hist.length-1}stepHistory(e){this.histTimer&&this.flushHistory();let t=this.hi+e;if(t<0||t>=this.hist.length)return;this.hi=t;let n=this.hist[t];this.restoring=!0;let r=W(n.fx),i=r===this.effect;this.effect=r,this.composeParams={...n.compose},this.params={...n.params},this.fin={...n.fin},this.finBypass=n.bypass,this.stack=[...n.stack];for(let[e,t]of Object.entries(n.layers))if(e!==r.id){this.pcache.set(e,{...t});try{localStorage.setItem(Un(e),JSON.stringify(t))}catch{}}try{localStorage.setItem(Yn,JSON.stringify(this.stack))}catch{}this.saveParams(),this.saveFinish();try{localStorage.setItem(Wn,r.id)}catch{}i?(this.syncPanel(),this.syncEngine()):this.buildPanel(),this.restoring=!1,this.updateHistButtons(),this.requestRender()}toggleSplit(){this.renderer&&this.source&&(this.loupeOn&&this.closeLoupe(),this.split=!this.split,this.applySplit(),this.render())}applySplit(){this.ref(`splitBtn`).classList.toggle(`lf3-on`,this.split),this.ref(`beforeCv`).hidden=!this.split,this.ref(`splitLine`).hidden=!this.split,this.root.style.setProperty(`--lf3-split`,`${this.splitPos*100}%`),this.root.classList.toggle(`lf3-splitting`,this.split)}captureBefore(){let e=this.renderer;if(!e)return;e.applyCompose(null,null),e.renderToCanvas(null,this.params);let t=this.ref(`beforeCv`);t.width=this.canvas.width,t.height=this.canvas.height,t.getContext(`2d`)?.drawImage(this.canvas,0,0),this.beforeDirty=!1}bindSplit(){let e=this.ref(`splitHandle`),t=this.ref(`stage`),n=-1;e.addEventListener(`pointerdown`,t=>{n=t.pointerId;try{e.setPointerCapture(n)}catch{}t.preventDefault(),t.stopPropagation()}),e.addEventListener(`pointermove`,e=>{if(e.pointerId!==n)return;let r=t.getBoundingClientRect();this.splitPos=Math.min(.98,Math.max(.02,(e.clientX-r.left)/r.width)),this.root.style.setProperty(`--lf3-split`,`${this.splitPos*100}%`)});let r=e=>{e.pointerId===n&&(n=-1)};e.addEventListener(`pointerup`,r),e.addEventListener(`pointercancel`,r)}async toggleLoupe(){if(this.loupeOn){this.closeLoupe();return}let e=this.source;if(e&&this.renderer&&!this.busy){if(e.kind!==`file`)this.toast(`Lupa 100% działa na wczytanym pliku (nie na SAMPLE).`,`warn`);else{this.split&&(this.split=!1,this.applySplit()),this.setBusy(!0,`LUPA 100%…`,.3);try{let t=this.loupe??new In(this.ref(`loupeCv`));this.loupe=t;let n=this.layer?{def:this.composeDef,params:{...this.composeParamsNow()},layer:this.layer}:null;await t.open(e.file,e.orientation,n);let r=this.ref(`stage`).getBoundingClientRect(),{s:i,tx:a,ty:o}=this.zoom;t.setCenterFraction(Math.min(1,Math.max(0,.5-a/(i*r.width))),Math.min(1,Math.max(0,.5-o/(i*r.height)))),this.loupeOn=!0,this.setBusy(!1),this.ref(`loupeCv`).hidden=!1,this.root.classList.add(`lf3-loupeon`),this.ref(`loupeBtn`).classList.add(`lf3-on`),this.drawLoupe(),this.toast(t.full?`100% · ${t.w}×${t.h} — przeciągnij, by przesuwać; dotknij, by wyjść`:`UWAGA: lupa na zmniejszonej wersji ${t.w}×${t.h} (limit pamięci urządzenia)`,t.full?`ok`:`warn`,3500)}catch(e){this.setBusy(!1),this.closeLoupe(),this.toast(`Lupa niedostępna: ${e.message}`,`err`,8e3)}}}}closeLoupe(){this.loupeOn=!1,cancelAnimationFrame(this.loupeRaf),this.loupeRaf=0,this.loupe?.dispose(),this.loupe=null,this.ref(`loupeCv`).hidden=!0,this.root.classList.remove(`lf3-loupeon`),this.ref(`loupeBtn`).classList.remove(`lf3-on`)}loupeSize(){let e=this.ref(`stage`).getBoundingClientRect(),t=Math.min(window.devicePixelRatio||1,3),n=Math.max(64,Math.min(2048,Math.round(e.width*t)));return{vw:n,vh:Math.max(64,Math.min(2048,Math.round(e.height*t))),k:n/e.width}}drawLoupe(){if(!this.loupeOn||!this.loupe?.ready)return;let{vw:e,vh:t}=this.loupeSize(),n=this.layer?{def:this.composeDef,params:{...this.composeParamsNow()},layer:this.layer}:null,r=this.effect.stage===`compose`?[]:this.layers(),i=r[r.length-1]??null;try{this.loupe.draw(i?.effect??null,i?.params??this.params,i?this.finEff():null,n,e,t,r.slice(0,-1))}catch(e){this.closeLoupe(),this.toast(`Lupa: ${e.message}`,`err`,8e3)}}requestLoupe(){this.loupeRaf||=requestAnimationFrame(()=>{this.loupeRaf=0,this.drawLoupe()})}bindLoupe(){let e=this.ref(`loupeCv`),t=null;e.addEventListener(`pointerdown`,n=>{t={x:n.clientX,y:n.clientY,id:n.pointerId,moved:!1,t:performance.now()};try{e.setPointerCapture(n.pointerId)}catch{}n.preventDefault()}),e.addEventListener(`pointermove`,e=>{if(!t||e.pointerId!==t.id||!this.loupe)return;let{vw:n,vh:r,k:i}=this.loupeSize(),a=e.clientX-t.x,o=e.clientY-t.y;!t.moved&&Math.hypot(a,o)<6||(t.moved=!0,this.loupe.pan(a*i,o*i,n,r),t.x=e.clientX,t.y=e.clientY,this.requestLoupe())}),e.addEventListener(`pointerup`,e=>{if(!t||e.pointerId!==t.id)return;let n=!t.moved&&performance.now()-t.t<300;t=null,n&&this.closeLoupe()}),e.addEventListener(`pointercancel`,()=>{t=null})}async buildThumbs(){let e=this.source;if(!e||!this.renderer)return;let t=++this.thumbGen,n=document.createElement(`canvas`),r=null;try{if(r=qt.create(n),!r)return;if(e.kind===`file`){let t=await $(e.file);try{r.loadSource(t,t.width,t.height,e.orientation,300)}finally{t.close()}}else r.loadSource(e.canvas,e.canvas.width,e.canvas.height,1,300);let i=new Map;for(let e of jt()){if(t!==this.thumbGen)return;if(e.stage===`compose`)continue;r.setFinish(null),r.renderToCanvas(e,e===this.effect?this.params:this.loadParams(e));let a=document.createElement(`canvas`);a.width=n.width,a.height=n.height,a.getContext(`2d`)?.drawImage(n,0,0),i.set(e.id,a.toDataURL(`image/jpeg`,.7)),await new Promise(e=>setTimeout(e,0))}if(t!==this.thumbGen)return;this.thumbs=i,this.applyThumbs()}catch{}finally{r?.dispose(),n.width=0,n.height=0}}applyThumbs(){for(let e of this.root.querySelectorAll(`.lf3-fxtile[data-fx]`)){let t=this.thumbs.get(e.dataset.fx);t&&(e.style.backgroundImage=`linear-gradient(0deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,0) 62%), url(${t})`,e.classList.add(`lf3-thumb`))}}loadFinish(){let e=Lt();try{let t=JSON.parse(localStorage.getItem(qn)??`{}`);for(let n of G){let r=t[n.id];typeof r==`number`&&Number.isFinite(r)&&n.id!==`mask`&&(e[n.id]=n.kind===`number`?Math.min(n.max,Math.max(n.min,r)):r)}}catch{}return e}saveFinish(){try{localStorage.setItem(qn,JSON.stringify(this.fin))}catch{}this.pushHistory()}finEff(){return this.finBypass?{...this.fin,hl:0,sh:0,tr:0,grain:0}:this.fin}buildEngine(){let e=this.ref(`engineBody`);e.innerHTML=``;for(let t of G)if(t.kind===`enum`){let n=document.createElement(`div`);n.className=`lf3-enumrow`,n.innerHTML=`<span class="lf3-sl-name">${t.label}</span>`;let r=document.createElement(`div`);r.className=`lf3-chips`;for(let e of t.options){let n=document.createElement(`button`);n.className=`lf3-chip`,n.textContent=e.label,n.dataset.fenum=t.id,n.dataset.value=String(e.value),n.addEventListener(`click`,()=>{this.fin[t.id]=e.value,this.syncEngine(),this.requestRender()}),r.appendChild(n)}n.appendChild(r),e.appendChild(n)}else{let n=document.createElement(`label`);n.className=`lf3-slider`,n.innerHTML=`<span class="lf3-sl-name">${t.label}</span><output data-fout="${t.id}"></output>`;let r=document.createElement(`input`);r.type=`range`,r.min=String(t.min),r.max=String(t.max),r.step=String(t.step),r.dataset.fparam=t.id,r.addEventListener(`input`,()=>{this.fin[t.id]=Number(r.value),this.syncEngine(!1),this.saveFinish(),this.requestRender()}),n.appendChild(r),e.appendChild(n)}this.syncEngine()}paintSliders(){for(let e of this.root.querySelectorAll(`input[type="range"]`)){let t=Number(e.min),n=Number(e.max);e.style.setProperty(`--fill`,`${n>t?(Number(e.value)-t)/(n-t)*100:0}%`)}}bindSliderFeel(){let e=e=>{let t=e.target;t instanceof HTMLInputElement&&t.type===`range`&&t.closest(`.lf3-slider`)?.classList.add(`lf3-active`)},t=()=>{for(let e of this.root.querySelectorAll(`.lf3-slider.lf3-active`))e.classList.remove(`lf3-active`)};this.root.addEventListener(`pointerdown`,e),this.root.addEventListener(`touchstart`,e,{passive:!0}),this.root.addEventListener(`input`,t=>{e(t),this.paintSliders()});for(let e of[`pointerup`,`pointercancel`,`touchend`,`touchcancel`])window.addEventListener(e,t);window.addEventListener(`blur`,t)}syncEngine(e=!0){for(let t of G)if(t.kind===`number`){let n=this.root.querySelector(`[data-fout="${t.id}"]`);if(n&&(n.textContent=String(Math.round(this.fin[t.id]*100))),e){let e=this.root.querySelector(`input[data-fparam="${t.id}"]`);e&&(e.value=String(this.fin[t.id]))}}for(let e of this.root.querySelectorAll(`.lf3-chip[data-fenum]`))e.classList.toggle(`lf3-on`,this.fin[e.dataset.fenum]===Number(e.dataset.value));let t=Rt(K(this.fin)),n=this.ref(`engPill`);n.textContent=this.fin.mask>0?`MASK · ${[``,`AFFECTED`,`CLIPPING`,`ENGINE`][this.fin.mask]}`:t?this.finBypass?`ENGINE · BYPASS`:`ENGINE · ON`:`ENGINE · OFF`,n.classList.toggle(`lf3-on`,t&&!this.finBypass||this.fin.mask>0),n.classList.toggle(`lf3-bypass`,t&&this.finBypass),this.paintSliders(),this.syncPanel(!1)}engineMatches(e){let t={...Lt(),...e.engine??{}};return G.every(e=>e.kind!==`number`||Math.abs(this.fin[e.id]-t[e.id])<1e-6)}userPresets(){try{let e=JSON.parse(localStorage.getItem(Gn)??`[]`);return Array.isArray(e)?e.map(e=>Xt(e,W)).flatMap(e=>e.ok?[e.preset]:[]):[]}catch{return[]}}writeUserPresets(e){try{localStorage.setItem(Gn,JSON.stringify(e))}catch{}}allPresets(){return[...tn,...this.userPresets()]}isLocked(){try{return!!JSON.parse(localStorage.getItem(Kn)??`{}`)[this.effect.id]}catch{return!1}}readSeeds(){try{let e=JSON.parse(localStorage.getItem(Qn(this.effect.id))??`[]`);return Array.isArray(e)?e.filter(e=>typeof e==`number`):[]}catch{return[]}}writeSeeds(e){try{localStorage.setItem(Qn(this.effect.id),JSON.stringify(e))}catch{}}setSeed(e){let t=this.effect.seedParam;t&&(this.params[t]=e,this.syncPanel(),this.saveParams(),this.requestRender(),this.updateSeedBar())}genVariant(){this.effect.seedParam&&(this.isLocked()?this.toast(`Wariant zablokowany (LOCK VARIANT). Odblokuj, aby losować nowy.`,`warn`):this.setSeed(Math.floor(Math.random()*1e4)))}toggleLock(){try{let e=JSON.parse(localStorage.getItem(Kn)??`{}`);e[this.effect.id]=!e[this.effect.id],localStorage.setItem(Kn,JSON.stringify(e))}catch{}this.updateSeedBar()}saveSeed(){let e=this.effect.seedParam;if(!e)return;let t=Math.round(this.params[e]),n=this.readSeeds().filter(e=>e!==t);n.unshift(t),this.writeSeeds(n.slice(0,12));try{navigator.clipboard?.writeText(`${this.effect.name} SEED ${t}`)?.catch(()=>{})}catch{}this.updateSeedBar(),this.toast(`Zapisano SEED ${t}`,`ok`)}saveUserPreset(){let e=this.effect.seedParam,t=this.userPresets(),n=t.filter(e=>e.operations[0].effect===this.effect.id).length+1,r=`${this.effect.name} ${e?`S${Math.round(this.params[e])}`:`USER ${n}`}`;t.push({schema_version:1,id:`user.${this.effect.id}.${Date.now()}`,name:r,author:`USER`,mix:1,operations:[{effect:this.effect.id,enabled:!0,params:{...this.params}}],...Rt(K(this.fin))?{engine:Object.fromEntries(G.filter(e=>e.kind===`number`).map(e=>[e.id,this.fin[e.id]]))}:{}}),this.writeUserPresets(t),this.buildPanel(),this.toast(`Zapisano preset ${r}`,`ok`)}updateSeedBar(){let e=this.effect.seedParam,t=this.ref(`seedbar`);if(t.hidden=!e,!e)return;let n=this.isLocked();this.ref(`btnLock`).textContent=n?`UNLOCK VARIANT`:`LOCK VARIANT`,this.ref(`btnLock`).classList.toggle(`lf3-on`,n);let r=this.root.querySelector(`input[data-param="${e}"]`);r&&(r.disabled=n);let i=this.ref(`seedlist`);i.innerHTML=``;for(let t of this.readSeeds()){let n=document.createElement(`button`);n.className=`lf3-chip`+(Math.round(this.params[e])===t?` lf3-on`:``),n.textContent=`S${t}`,n.addEventListener(`click`,()=>{this.isLocked()?this.toast(`Wariant zablokowany.`,`warn`):this.setSeed(t)});let r=document.createElement(`span`);r.className=`lf3-x`,r.textContent=` ×`,r.addEventListener(`click`,e=>{e.stopPropagation(),this.writeSeeds(this.readSeeds().filter(e=>e!==t)),this.updateSeedBar()}),n.appendChild(r),i.appendChild(n)}}tile(e){let t=document.createElement(`button`);t.className=`lf3-fxtile`+(e===this.effect?` lf3-on`:``)+(e.stage===`compose`&&this.layer?` lf3-live`:``)+(e!==this.effect&&this.stack.includes(e.id)?` lf3-stk`:``),t.dataset.fx=e.id,t.innerHTML=`${Bn(e.id)}<span>${e.name}</span>`;let n=this.thumbs.get(e.id);return n&&(t.style.backgroundImage=`linear-gradient(0deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,0) 62%), url(${n})`,t.classList.add(`lf3-thumb`)),t}buildRail(){let e=this.ref(`fx`);e.innerHTML=``;for(let t of jt()){let n=this.tile(t);n.addEventListener(`click`,()=>this.setEffect(t.id)),e.appendChild(n)}e.dataset.bound||(e.dataset.bound=`1`,e.addEventListener(`scroll`,()=>this.updateRailBar(),{passive:!0}),window.addEventListener(`resize`,()=>this.updateRailBar())),requestAnimationFrame(()=>{let t=e.querySelector(`.lf3-fxtile.lf3-on`);t&&e.scrollTo({left:t.offsetLeft-(e.clientWidth-t.offsetWidth)/2,behavior:`smooth`}),this.updateRailBar()})}updateRailBar(){let e=this.ref(`fx`),t=e.scrollWidth-e.clientWidth,n=this.ref(`railwrap`);n.classList.toggle(`lf3-more-r`,e.scrollLeft<t-4),n.classList.toggle(`lf3-more-l`,e.scrollLeft>4);let r=this.ref(`railthumb`),i=e.scrollWidth>0?Math.min(1,e.clientWidth/e.scrollWidth):1;r.style.width=`${i*100}%`,r.style.left=t>0?`${e.scrollLeft/t*(1-i)*100}%`:`0`,this.ref(`railthumb`).parentElement.style.visibility=t>2?`visible`:`hidden`}openAllFx(e=!1){let t=this.ref(`allgrid`);t.innerHTML=``,this.root.querySelector(`.lf3-allhead span`).textContent=e?`DODAJ DO STOSU`:`ALL FX`;for(let n of jt()){if(e&&n.stage===`compose`)continue;let r=this.tile(n);r.insertAdjacentHTML(`beforeend`,`<small>${n.blurb}</small>`),r.addEventListener(`click`,()=>{this.closeAllFx(),e?this.addEffect(n.id):this.setEffect(n.id)}),t.appendChild(r)}this.ref(`allsheet`).hidden=!1}closeAllFx(){this.ref(`allsheet`).hidden=!0}setFocus(e){this.focus=e,this.root.classList.toggle(`lf3-focus`,e),this.ref(`focusBtn`).hidden=e||!this.source,this.ref(`focusExit`).hidden=!e;let t=this.ref(`focusHint`);t.hidden=!e,e&&window.setTimeout(()=>{t.hidden=!0},3500),this.zoom={s:1,tx:0,ty:0},this.applyZoom()}applyZoom(){let{s:e,tx:t,ty:n}=this.zoom,r=e===1&&t===0&&n===0?``:`translate(${t}px, ${n}px) scale(${e})`;this.canvas.style.transform=r,this.ref(`beforeCv`).style.transform=r}buildPanel(){this.ref(`emptyTitle`).textContent=this.effect.name,this.buildRail(),this.buildStackBar();let e=this.ref(`chips`);e.innerHTML=``;let t=this.readFavs(),n=this.allPresets().filter(e=>e.operations[0].effect===this.effect.id);n.sort((e,n)=>Number(t.has(n.id))-Number(t.has(e.id)));for(let r of n){let n=document.createElement(`button`);n.className=`lf3-chip`+(t.has(r.id)?` lf3-fav`:``),n.textContent=r.name.replace(`${this.effect.name} `,``),n.dataset.preset=r.id,n.addEventListener(`click`,()=>this.applyPreset(r));let i=document.createElement(`span`);if(i.className=`lf3-star`,i.textContent=t.has(r.id)?`★`:`☆`,i.addEventListener(`click`,e=>{e.stopPropagation(),this.toggleFav(r.id)}),n.appendChild(i),r.author===`USER`){let e=document.createElement(`span`);e.className=`lf3-x`,e.textContent=` ×`,e.addEventListener(`click`,e=>{e.stopPropagation(),this.writeUserPresets(this.userPresets().filter(e=>e.id!==r.id)),this.buildPanel()}),n.appendChild(e)}e.appendChild(n)}if(!this.effect.seedParam&&this.effect.stage!==`compose`){let t=document.createElement(`button`);t.className=`lf3-chip lf3-add`,t.textContent=`+ PRESET`,t.addEventListener(`click`,()=>this.saveUserPreset()),e.appendChild(t)}let r=this.ref(`enums`);r.innerHTML=``;for(let e of this.effect.params)e.kind===`enum`&&e.id!==`variant`&&r.appendChild(this.enumRow(e));let i=this.ref(`sliders`),a=this.ref(`moreSliders`);i.innerHTML=``,a.innerHTML=``;let o=this.effect.params.filter(e=>e.kind===`number`),s=new Set(Ln[this.effect.id]??o.slice(0,4).map(e=>e.id));for(let e of o)(s.has(e.id)?i:a).appendChild(this.sliderRow(e));this.ref(`moreLabel`).textContent=`MORE · ${a.childElementCount+G.length}`,this.syncPanel(),this.buildEngine(),this.updateLayerBar(),this.updateSeedBar()}enumRow(e){let t=document.createElement(`div`);t.className=`lf3-enumrow`,t.innerHTML=`<span class="lf3-sl-name">${e.label}</span>`;let n=document.createElement(`div`);n.className=`lf3-chips`;for(let t of e.options){let r=document.createElement(`button`);r.className=`lf3-chip`,r.textContent=t.label,r.dataset.enum=e.id,r.dataset.value=String(t.value),r.addEventListener(`click`,()=>{this.params[e.id]=t.value,this.syncPanel(!1),this.saveParams(),this.requestRender()}),n.appendChild(r)}return t.appendChild(n),t}sliderRow(e){let t=document.createElement(`label`);t.className=`lf3-slider`,t.innerHTML=`<span class="lf3-sl-name">${e.label}</span><output data-out="${e.id}"></output>`;let n=document.createElement(`input`);return n.type=`range`,n.min=String(e.min),n.max=String(e.max),n.step=String(e.step),n.dataset.param=e.id,n.addEventListener(`input`,()=>{this.params[e.id]=Number(n.value),this.syncPanel(!1),this.saveParams(),this.requestRender()}),t.appendChild(n),t}syncPanel(e=!0){for(let t of this.effect.params){if(t.kind!==`number`)continue;let n=this.root.querySelector(`[data-out="${t.id}"]`);if(n&&(n.textContent=String(Math.round(this.params[t.id]*(t.displayScale??100)))),e){let e=this.root.querySelector(`input[data-param="${t.id}"]`);e&&(e.value=String(this.params[t.id]))}}for(let e of this.root.querySelectorAll(`.lf3-chip[data-preset]`)){let t=this.allPresets().find(t=>t.id===e.dataset.preset),n=t?.operations[0].params??{},r=`variant`in n?n.variant===this.params.variant:Object.entries(n).every(([e,t])=>Math.abs((this.params[e]??NaN)-t)<1e-6);e.classList.toggle(`lf3-on`,r&&!!t&&this.engineMatches(t))}for(let e of this.root.querySelectorAll(`.lf3-chip[data-enum]`))e.classList.toggle(`lf3-on`,this.params[e.dataset.enum]===Number(e.dataset.value));this.paintSliders()}applyPreset(e){let t=e.operations[0],n=this.effect.stage===`compose`?{...this.params}:kt(this.effect);this.params={...n,...t.params},this.effect.stage!==`compose`&&(this.fin={...Lt(),...e.engine??{},mask:this.fin.mask},this.saveFinish(),this.syncEngine()),this.syncPanel(),this.saveParams(),this.requestRender()}bind(){let e=this.ref(`file`);this.root.addEventListener(`click`,t=>{let n=t.target.closest(`[data-act]`)?.dataset.act;n===`import`?(this.pickingLayer=!1,e.click()):n===`import-b`?(this.pickingLayer=!0,e.click()):n===`sample-b`?this.openLayerSample():n===`clear-b`?this.clearLayer():n===`all-fx`?this.openAllFx():n===`close-all`?this.closeAllFx():n===`focus`?this.setFocus(!0):n===`unfocus`?this.setFocus(!1):n===`undo`?this.stepHistory(-1):n===`redo`?this.stepHistory(1):n===`split`?this.toggleSplit():n===`loupe`?this.toggleLoupe():n===`engine-toggle`?(t.preventDefault(),t.stopPropagation(),Rt(K(this.fin))&&(this.finBypass=!this.finBypass,this.syncEngine(),this.pushHistory(),this.requestRender())):n===`engine-reset`?(this.fin={...Lt(),mask:this.fin.mask},this.saveFinish(),this.syncEngine(),this.requestRender()):n===`gen-variant`?this.genVariant():n===`lock-variant`?this.toggleLock():n===`save-seed`?this.saveSeed():n===`save-preset`?this.saveUserPreset():n===`sample`?this.openSample():n===`export`?this.doExport():n===`save`?this.saveResult():n===`save-disk`?this.saveResultToDisk():n===`close-result`&&this.closeResult()}),e.addEventListener(`change`,()=>{let t=e.files?.[0];e.value=``,t&&(this.pickingLayer?this.openLayerFile(t):this.openFile(t))});let t=this.ref(`compare`),n=e=>{e.preventDefault(),this.setBefore(!0)},r=()=>this.setBefore(!1);t.addEventListener(`pointerdown`,n),t.addEventListener(`pointerup`,r),t.addEventListener(`pointercancel`,r),t.addEventListener(`pointerleave`,r);let i=this.ref(`stage`);this.bindStageGestures(i,r),this.bindSplit(),this.bindSliderFeel(),this.bindLoupe(),window.addEventListener(`blur`,r)}bindStageGestures(e,t){let n=new Map,r=null,i=0,a=!1,o=0,s=0,c=0,l={s:1,tx:0,ty:0,mx:0,my:0,d:0},u=()=>{let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top+t.height/2}},d=()=>{let e=u(),t=[...n.values()];return{mx:t.reduce((e,t)=>e+t.x,0)/t.length-e.x,my:t.reduce((e,t)=>e+t.y,0)/t.length-e.y,d:t.length>1?Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y):0}},f=()=>{l={...this.zoom,...d()}};e.addEventListener(`pointerdown`,e=>{if(e.target===this.canvas){if(e.preventDefault(),n.set(e.pointerId,{x:e.clientX,y:e.clientY}),this.focus){n.size===1?(a=!0,o=performance.now(),s=e.clientX,c=e.clientY,i=window.setTimeout(()=>{a&&(a=!1,this.setBefore(!0))},280)):(a=!1,clearTimeout(i),this.setBefore(!1)),f();try{this.canvas.setPointerCapture(e.pointerId)}catch{}}else if(this.effect.stage===`compose`&&this.layer&&this.source){r={x:e.clientX,y:e.clientY,px:this.params.pos_x,py:this.params.pos_y,id:e.pointerId};try{this.canvas.setPointerCapture(e.pointerId)}catch{}}else this.split||this.setBefore(!0)}}),e.addEventListener(`pointermove`,t=>{if(this.focus){if(!n.has(t.pointerId)||(n.set(t.pointerId,{x:t.clientX,y:t.clientY}),a&&Math.hypot(t.clientX-s,t.clientY-c)>8&&(a=!1,clearTimeout(i)),a&&n.size===1))return;let r=d(),o=l.d>0?Math.min(8,Math.max(1,l.s*(r.d/l.d))):l.s,u=o/l.s,f=r.mx-u*(l.mx-l.tx),p=r.my-u*(l.my-l.ty),m=e.getBoundingClientRect(),h=(o-1)*m.width/2,g=(o-1)*m.height/2;f=Math.max(-h,Math.min(h,f)),p=Math.max(-g,Math.min(g,p)),this.zoom=o<=1?{s:1,tx:0,ty:0}:{s:o,tx:f,ty:p},this.applyZoom();return}if(!r||t.pointerId!==r.id)return;let o=this.canvas.getBoundingClientRect(),u=Math.min(o.width/this.canvas.width,o.height/this.canvas.height),f=this.canvas.width*u,p=this.canvas.height*u,m=e=>Math.max(-.5,Math.min(.5,e));this.params.pos_x=m(r.px+(t.clientX-r.x)/f),this.params.pos_y=m(r.py+(t.clientY-r.y)/p),this.syncPanel(),this.saveParams(),this.requestRender()});let p=e=>{if(this.focus&&n.has(e.pointerId)){let t=a&&n.size===1&&performance.now()-o<280;if(n.delete(e.pointerId),clearTimeout(i),a=!1,this.showingBefore&&this.setBefore(!1),t){this.setFocus(!1);return}n.size>0&&f()}else r=null,n.delete(e.pointerId),t()};e.addEventListener(`pointerup`,p),e.addEventListener(`pointercancel`,p)}setBefore(e){this.source&&this.showingBefore!==e&&(this.showingBefore=e,this.ref(`badge`).hidden=!e,this.render())}async openFile(e){if(!this.busy){this.setBusy(!0,`WCZYTYWANIE…`,.1);try{let t=await yn(e),n=await Cn(t),r=await $(e),i;try{i=this.useBitmap(r,n)}finally{r.close()}this.source={kind:`file`,file:e,orientation:n},this.fileName=e.name.replace(/\.[^.]+$/,``);let a=t?.width||r.width,o=t?.height||r.height,s=n>=5||t&&t.orientation>=5&&n===1,c=s?o:a,l=s?a:o;this.ref(`meta`).textContent=`${e.name} · ${c}×${l} (${(c*l/1e6).toFixed(1)} MP) · podgląd ${i.width}×${i.height}`,this.afterLoad()}catch(e){this.toast(`Nie udało się otworzyć pliku: ${e.message}`,`err`,8e3)}finally{this.setBusy(!1)}}}openSample(){let e=1280,t=document.createElement(`canvas`);t.width=e,t.height=853,t.getContext(`2d`).putImageData(new ImageData(Dn(e,853),e,853),0,0);try{this.loadCanvas(t),this.source={kind:`sample`,canvas:t},this.fileName=`sample`,this.ref(`meta`).textContent=`SAMPLE · ${e}×853`,this.afterLoad()}catch(e){this.toast(`SAMPLE: ${e.message}`,`err`,8e3)}}composeUnavailable(){return this.renderer?!this.source&&(this.toast(`Najpierw wczytaj zdjęcie A (IMPORT lub SAMPLE).`,`warn`),!0):(this.toast(`DOUBLE EXPOSURE wymaga WebGL2 — na tym urządzeniu niedostępne.`,`warn`,7e3),!0)}async openLayerFile(e){if(!(this.busy||this.composeUnavailable())){this.setBusy(!0,`WCZYTYWANIE KLATKI B…`,.1);try{let t=await yn(e),n={kind:`file`,file:e,orientation:await Cn(t)};await kn(this.renderer,n,this.previewMax),this.layer=n,this.layerName=e.name;let r=(t?.orientation??1)>=5;this.layerSize=t?`${r?t.height:t.width}×${r?t.width:t.height}`:``,this.updateLayerBar(),this.render()}catch(e){this.toast(`Nie udało się wczytać klatki B: ${e.message}`,`err`,8e3)}finally{this.setBusy(!1)}}}openLayerSample(){if(!this.composeUnavailable())try{let e=Fn(1280,853),t={kind:`sample`,canvas:e};this.renderer.loadLayer(e,e.width,e.height,1,this.previewMax),this.layer=t,this.layerName=`SAMPLE B`,this.layerSize=`1280×853`,this.updateLayerBar(),this.render()}catch(e){this.toast(`SAMPLE B: ${e.message}`,`err`,8e3)}}clearLayer(){this.renderer?.clearLayer(),this.layer=null,this.layerName=``,this.layerSize=``,this.updateLayerBar(),this.render()}updateLayerBar(){let e=this.effect.stage===`compose`,t=this.ref(`layerbar`);t.hidden=!(e||this.layer);let n=this.ref(`layerInfo`);n.textContent=this.renderer?this.layer?`KLATKA B: ${this.layerName}${this.layerSize?` · ${this.layerSize}`:``}${e?``:` → efekt działa na A+B`}`:`Wczytaj drugie zdjęcie (B). Efekty z listy będą działać na złożonym wyniku A+B.`:`DOUBLE EXPOSURE wymaga WebGL2 (niedostępne na tym urządzeniu).`,this.ref(`btnLoadB`).hidden=!e||!this.renderer,this.ref(`btnSampleB`).hidden=!e||!this.renderer,this.ref(`btnClearB`).hidden=!this.layer;for(let e of this.root.querySelectorAll(`.lf3-fxtile[data-fx="double_exposure"]`))e.classList.toggle(`lf3-live`,!!this.layer)}loadCanvas(e){this.renderer?this.renderer.loadSource(e,e.width,e.height,1,this.previewMax):(this.cpuSrc=e.getContext(`2d`).getImageData(0,0,e.width,e.height),this.canvas.width=e.width,this.canvas.height=e.height)}useBitmap(e,t){if(this.renderer)return this.renderer.loadSource(e,e.width,e.height,t,this.previewMax);let n=t>=5,r=n?e.height:e.width,i=n?e.width:e.height,a=Math.min(1,1e3/Math.max(r,i)),o=Math.round(e.width*a),s=Math.round(e.height*a),c=document.createElement(`canvas`);c.width=n?s:o,c.height=n?o:s;let l=c.getContext(`2d`,{willReadFrequently:!0}),u={1:[1,0,0,1,0,0],2:[-1,0,0,1,o,0],3:[-1,0,0,-1,o,s],4:[1,0,0,-1,0,s],5:[0,1,1,0,0,0],6:[0,1,-1,0,s,0],7:[0,-1,-1,0,s,o],8:[0,-1,1,0,0,o]};return l.setTransform(...u[t]??u[1]),l.imageSmoothingQuality=`high`,l.drawImage(e,0,0,o,s),this.cpuSrc=l.getImageData(0,0,c.width,c.height),this.canvas.width=c.width,this.canvas.height=c.height,{width:c.width,height:c.height}}async reloadSource(){let e=this.source;if(e&&this.renderer)try{if(e.kind===`sample`)this.loadCanvas(e.canvas);else{let t=await $(e.file);try{this.useBitmap(t,e.orientation)}finally{t.close()}}this.layer&&await kn(this.renderer,this.layer,this.previewMax),this.beforeDirty=!0,this.render()}catch(e){this.toast(`Odtwarzanie po utracie GPU nie powiodło się: ${e.message}`,`err`)}}afterLoad(){this.ref(`empty`).hidden=!0,this.ref(`compare`).disabled=!1,this.ref(`focusBtn`).hidden=this.focus,this.ref(`tools`).hidden=!1,this.ref(`hist`).hidden=!1,this.root.querySelector(`[data-act="export"]`).disabled=!1,this.loupeOn&&this.closeLoupe(),this.beforeDirty=!0,this.thumbs=new Map,this.resetHistory(),this.render(),window.setTimeout(()=>{this.buildThumbs()},80)}requestRender(){!this.raf&&this.source&&(this.raf=requestAnimationFrame(()=>{this.raf=0,this.render()}))}composeParamsNow(){return this.effect.stage===`compose`?this.params:this.composeParams}render(){if(!this.source)return;let e=this.effect.stage===`compose`,t=this.showingBefore||e?[]:this.layers(),n=t[t.length-1]??null,r=n?.effect??null;try{if(this.renderer){let e=!!this.layer&&!this.showingBefore;this.split&&this.beforeDirty&&this.captureBefore(),this.renderer.applyCompose(e?this.composeDef:null,e?this.composeParamsNow():null),this.renderer.setFinish(this.finEff()),this.renderer.setPre(t.slice(0,-1)),this.renderer.renderToCanvas(r,n?.params??this.params)}else if(this.ctx2d&&this.cpuSrc){let e=this.cpuSrc,n=e.data;for(let r of t)n=r.effect.cpu(n,e.width,e.height,r.params);r&&Rt(K(this.finEff()))&&(n=Wt(n,e.data,e.width,e.height,K(this.finEff())));let i=new Uint8ClampedArray(e.width*e.height*4);i.set(n),this.ctx2d.putImageData(new ImageData(i,e.width,e.height),0,0)}this.loupeOn&&this.requestLoupe()}catch(e){this.toast(`Błąd renderowania: ${e.message}`,`err`,1e4)}}async doExport(){if(this.busy||!this.source)return;this.loupeOn&&this.closeLoupe();let e=this.effect.stage===`compose`;if(e&&!this.layer){this.toast(`Wczytaj klatkę B (WCZYTAJ B lub SAMPLE B), zanim wyeksportujesz DOUBLE EXPOSURE.`,`warn`,6e3);return}let t=e?[]:this.layers(),n=t[t.length-1]??null,r={...n?.params??this.params},i=n?.effect??null,a=this.layer?{def:this.composeDef,params:{...this.composeParamsNow()},layer:this.layer}:null,o=this.effect.params.find(e=>e.kind===`enum`&&e.id===`variant`),s=o?`-${o.options.find(e=>e.value===r.variant)?.label??``}`:``,c=this.effect.seedParam?`-S${Math.round(r[this.effect.seedParam])}`:``,l=(this.layer&&!e?`DOUBLE-EXPOSURE_`:``)+(t.length?t.map(e=>e.effect.name.replace(/\s+/g,`-`)).join(`+`):this.effect.name.replace(/\s+/g,`-`)),u=`${this.fileName}_LF3-${l}${s}${c}.jpg`;this.setBusy(!0,`EKSPORT…`,0);let d=e=>this.setBusy(!0,`EKSPORT ${Math.round(e*100)}%`,e);try{let e;if(!this.renderer)throw Error(`Tryb awaryjny CPU: eksport w pełnej rozdzielczości wymaga WebGL2.`);e=this.source.kind===`file`?await An(this.source.file,this.source.orientation,i,r,$n,d,a,K(this.finEff()),t.slice(0,-1)):await jn(this.source.canvas,i,r,$n,d,a,K(this.finEff()),t.slice(0,-1)),this.setBusy(!1),this.showResult(e.blob,u,`${e.note} · ${(e.blob.size/1048576).toFixed(1)} MB`,e.fullResolution)}catch(e){this.toast(`Eksport nieudany: ${e.message}`,`err`,12e3)}finally{this.setBusy(!1)}}showResult(e,t,n,r){this.ref(`shareBtn`).hidden=!Nn(),this.closeResult();let i=URL.createObjectURL(e);this.lastResult={blob:e,name:t,url:i},this.ref(`resultImg`).src=i;let a=this.ref(`resultInfo`);a.textContent=n,a.dataset.kind=r?`ok`:`warn`,this.ref(`result`).hidden=!1}async saveResultToDisk(){let e=this.lastResult;if(e)try{let t=await Mn(e.blob,e.name);if(t===`saved`)this.toast(`Zapisano ${e.name}`,`ok`);else if(t===`downloaded`){let t=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);this.toast(t?`Pobrano ${e.name}. Safari zapisuje do folderu z Ustawień → Ogólne → „Lokalizacja pobranych plików” (ustaw „Zapytaj o każdy”, by wybierać folder).`:`Pobrano ${e.name}`,`ok`,9e3)}}catch(e){this.toast(`Zapis nieudany: ${e.message}`,`err`,8e3)}}async saveResult(){let e=this.lastResult;if(e)try{await Pn(e.blob,e.name)===`downloaded`&&this.toast(`Pobrano ${e.name}`,`ok`)}catch(e){this.toast(`Zapis nieudany: ${e.message}`,`err`,8e3)}}closeResult(){this.lastResult&&URL.revokeObjectURL(this.lastResult.url),this.lastResult=null,this.ref(`result`).hidden=!0,this.ref(`resultImg`).removeAttribute(`src`)}},nr=document.getElementById(`lastfrm3-root`);nr&&new tr(nr),`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`./sw.js`).catch(()=>{})});