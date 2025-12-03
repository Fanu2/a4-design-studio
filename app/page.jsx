\
        "use client";
        import React, { useEffect, useRef, useState } from "react";
        import styled from "styled-components";
        import { SketchPicker } from "react-color";
        import html2canvas from "html2canvas";
        import jsPDF from "jspdf";
        import interact from "interactjs";
        import Toolbar from "../components/Toolbar";

        const Wrapper = styled.div`padding:24px; max-width:1100px; margin:0 auto;`;
        const TopBar = styled.div`display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;`;
        const Tools = styled.div`display:flex; gap:12px; align-items:center; flex-wrap:wrap;`;
        const Side = styled.div`width:320px;`;
        const Main = styled.div`flex:1; display:flex; justify-content:center;`;
        const Flex = styled.div`display:flex; gap:16px;`;
        const A4 = styled.div.attrs(()=>({className:'a4'}))``;

        export default function Page(){
          const [elements,setElements] = useState([]);
          const [selected,setSelected] = useState(null);
          const [bg, setBg] = useState({r:255,g:250,b:250,a:1});
          const [fontFamily, setFontFamily] = useState('Dancing Script');
          const [filter, setFilter] = useState({ name:'none', value:''});
          const [history, setHistory] = useState([]);
          const [future, setFuture] = useState([]);

          const fileRef = useRef();
          const pageRef = useRef();

          useEffect(()=>{ // keyboard shortcuts undo/redo
            function onKey(e){
              if ((e.ctrlKey||e.metaKey) && e.key === 'z'){ e.preventDefault(); undo(); }
              if ((e.ctrlKey||e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key==='Z'))){ e.preventDefault(); redo(); }
            }
            window.addEventListener('keydown', onKey);
            return ()=> window.removeEventListener('keydown', onKey);
          },[history,future]);

          function pushHistory(snapshot){
            setHistory(h=>[...h, snapshot].slice(-50)); setFuture([]);
          }
          function snapshot(){ return JSON.stringify(elements); }
          function undo(){ setHistory(h=>{ if(h.length===0) return h; const nh=h.slice(0,-1); const last=h[h.length-1]; setFuture(f=>[snapshot(),...f]); setElements(JSON.parse(last)); return nh; }); }
          function redo(){ setFuture(f=>{ if(f.length===0) return f; const [first,*rest]=f; setHistory(h=>[...h, snapshot()]); setElements(JSON.parse(first)); return rest; }); }

          useEffect(()=>{
            elements.forEach(el=>{
              const node = document.getElementById('el-'+el.id);
              if(!node) return;
              if(node.dataset.interact==='1') return;
              try{
                interact(node).draggable({ listeners:{ move(event){ const dx=event.dx, dy=event.dy; setElements(prev=> prev.map(p=> p.id===el.id? {...p, x:p.x+dx, y:p.y+dy}:p)); } } })
                .resizable({ edges:{left:true,right:true,bottom:true,top:true}, listeners:{ move(event){ const {width,height}=event.rect; const dx=event.deltaRect.left, dy=event.deltaRect.top; setElements(prev=> prev.map(p=> p.id===el.id? {...p, x:p.x+dx, y:p.y+dy, width:Math.max(20,width), height:Math.max(20,height)}:p)); } }, modifiers:[ interact.modifiers.restrictSize({ min:{width:20,height:20}, max:{width:6000,height:6000} }) ] });
                node.dataset.interact='1';
              }catch(err){}
            });
          },[elements]);

          function addText(){ const id=Date.now()+Math.floor(Math.random()*999); const el={ id, type:'text', text:'My sweet love…', x:60, y:60, width:300, height:120, size:28, color:'#000', font:fontFamily, z:(elements.length? Math.max(...elements.map(e=>e.z||0))+1:1) }; pushHistory(snapshot()); setElements(p=>[...p,el]); setSelected(id); }
          function addIcon(name){ const id=Date.now()+Math.floor(Math.random()*999); const el={ id, type:'icon', icon:name, x:80, y:80, width:120, height:120, z:(elements.length? Math.max(...elements.map(e=>e.z||0))+1:1) }; pushHistory(snapshot()); setElements(p=>[...p,el]); setSelected(id); }

          function uploadImage(file){ if(!file) return; const reader=new FileReader(); reader.onloadend=()=>{ const img=new Image(); img.onload=()=>{ const MAX=1200; let w=img.width, h=img.height; const scale=Math.min(1, Math.min(MAX/w, MAX/h)); w=Math.round(w*scale); h=Math.round(h*scale); const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h); c.toBlob(blob=>{ const url=URL.createObjectURL(blob); const id=Date.now()+Math.floor(Math.random()*999); const el={ id, type:'image', src:url, x:80, y:80, width:Math.min(480,w), height:Math.min(360,h), filter:'none', frame:'none', z:(elements.length? Math.max(...elements.map(e=>e.z||0))+1:1) }; pushHistory(snapshot()); setElements(p=>[...p,el]); setSelected(id); },'image/jpeg',0.9); }; img.src=reader.result; }; reader.readAsDataURL(file); }

          function updateSelected(patch){ if(!selected) return; pushHistory(snapshot()); setElements(prev=> prev.map(el=> el.id===selected? {...el,...patch}:el)); }
          function bringForward(){ if(!selected) return; pushHistory(snapshot()); setElements(prev=> prev.map(el=> el.id===selected? {...el, z:(Math.max(...prev.map(p=>p.z||0))+1)}:el)); }
          function sendBackward(){ if(!selected) return; pushHistory(snapshot()); setElements(prev=> prev.map(el=> el.id===selected? {...el, z:Math.max(1,(el.z||1)-1)}:el)); }
          function deleteSelected(){ if(!selected) return; pushHistory(snapshot()); setElements(prev=> prev.filter(el=> el.id!==selected)); setSelected(null); }
          function applyFilterToSelected(filterName,value){ if(!selected) return; pushHistory(snapshot()); setElements(prev=> prev.map(el=> el.id===selected? {...el, filter:`${filterName}(${value})`} : el)); }
          function addFrameToSelected(kind){ if(!selected) return; pushHistory(snapshot()); setElements(prev=> prev.map(el=> el.id===selected? {...el, frame:kind}:el)); }
          function exportPNG(){ html2canvas(pageRef.current,{scale:2,useCORS:true}).then(canvas=>{ const link=document.createElement('a'); link.download='love-page.png'; link.href=canvas.toDataURL(); link.click(); }); }
          function exportPDF(){ html2canvas(pageRef.current,{scale:2,useCORS:true}).then(canvas=>{ const img=canvas.toDataURL('image/png'); const pdf=new jsPDF('p','mm','a4'); pdf.addImage(img,'PNG',0,0,210,297); pdf.save('love-page.pdf'); }); }

          function loadTemplate(kind){ pushHistory(snapshot()); if(kind==='love-letter'){ setElements([{ id:1, type:'text', text:'My dearest…', x:60, y:60, width:420, height:200, size:32, color:'#333', font:'Dancing Script', z:1 }]); } else if(kind==='collage'){ setElements([{ id:11, type:'image', src:'/sample1.jpg', x:60, y:60, width:220, height:160, z:1},{ id:12, type:'image', src:'/sample2.jpg', x:300, y:60, width:220, height:160, z:2},{ id:13, type:'text', text:'Our memories', x:60, y:240, width:460, height:100, size:28, color:'#222', font:'Great Vibes', z:3}]); } else if(kind==='valentine-card'){ setElements([{ id:21, type:'text', text:'Happy Valentine', x:80, y:120, width:360, height:120, size:36, color:'#b30059', font:'Pacifico', z:1 }]); } }

          return (
            <Wrapper>
              <TopBar>
                <h2 style={{margin:0}}>Love Studio — A4 Editor</h2>
                <Tools>
                  <Toolbar onAddText={()=>addText()} onAddHeart={()=>addIcon('❤️')} onUpload={()=>fileRef.current.click()} onExportPNG={()=>exportPNG()} onExportPDF={()=>exportPDF()} />
                </Tools>
              </TopBar>

              <Flex>
                <Side>
                  <div style={{background:'#fff',padding:12,borderRadius:8,boxShadow:'0 6px 18px rgba(0,0,0,0.06)'}}>
                    <h4>Background</h4>
                    <SketchPicker color={bg} onChange={(c)=> setBg(c.rgb)} />
                    <div style={{marginTop:8}}><label>Font family</label>
                      <select value={fontFamily} onChange={(e)=> setFontFamily(e.target.value)} style={{width:'100%'}}>
                        <option>Dancing Script</option><option>Great Vibes</option><option>Pacifico</option><option>Shadows Into Light</option>
                      </select>
                    </div>

                    <h4 style={{marginTop:12}}>Filters</h4>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button onClick={()=> setFilter({name:'none', value:''})}>None</button>
                      <button onClick={()=> setFilter({name:'sepia', value:'0.6'})}>Sepia</button>
                      <button onClick={()=> setFilter({name:'grayscale', value:'0.6'})}>Mono</button>
                      <button onClick={()=> setFilter({name:'blur', value:'2px'})}>Blur</button>
                      <button onClick={()=> setFilter({name:'contrast', value:'1.2'})}>Contrast</button>
                      <button onClick={()=> setFilter({name:'saturate', value:'1.2'})}>Saturate</button>
                      <button onClick={()=> setFilter({name:'hue-rotate', value:'280deg'})}>Pink</button>
                    </div>

                    <h4 style={{marginTop:12}}>Edit Selected</h4>
                    {!selected && <div style={{color:'#666'}}>Select an element to edit</div>}
                    {selected && (()=>{ const el = elements.find(x=>x.id===selected); if(!el) return null; return (
                      <div>
                        <div style={{display:'flex',gap:8,marginBottom:8}}>
                          <button onClick={()=> bringForward()}>Bring ↑</button>
                          <button onClick={()=> sendBackward()}>Send ↓</button>
                          <button onClick={()=> deleteSelected()}>Delete</button>
                        </div>
                        {el.type==='text' && (<>
                          <label>Text</label>
                          <textarea value={el.text} onChange={(e)=> updateSelected({text:e.target.value})} style={{width:'100%'}} />
                          <label>Size</label>
                          <input type="range" min="8" max="96" value={el.size} onChange={(e)=> updateSelected({size:Number(e.target.value)})} />
                          <label>Color</label>
                          <input type="color" value={el.color} onChange={(e)=> updateSelected({color:e.target.value})} />
                          <label>Font</label>
                          <select value={el.font||fontFamily} onChange={(e)=> updateSelected({font:e.target.value})}>
                            <option>Dancing Script</option><option>Great Vibes</option><option>Pacifico</option><option>Shadows Into Light</option>
                          </select>
                        </>)}

                        {el.type==='image' && (<>
                          <label>Apply filter to image</label>
                          <div style={{display:'flex',gap:8}}>
                            <button onClick={()=> applyFilterToSelected('grayscale','0.6')}>Mono</button>
                            <button onClick={()=> applyFilterToSelected('sepia','0.6')}>Sepia</button>
                            <button onClick={()=> applyFilterToSelected('blur','2px')}>Blur</button>
                            <button onClick={()=> applyFilterToSelected('hue-rotate','280deg')}>Pink</button>
                          </div>
                          <label>Frames</label>
                          <div style={{display:'flex',gap:8}}>
                            <button onClick={()=> addFrameToSelected('polaroid')}>Polaroid</button>
                            <button onClick={()=> addFrameToSelected('pink')}>Pink</button>
                            <button onClick={()=> addFrameToSelected('gold')}>Gold</button>
                            <button onClick={()=> addFrameToSelected('heart')}>Heart</button>
                          </div>
                        </>)}

                      </div>
                    )})()}

                    <h4 style={{marginTop:12}}>Templates</h4>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      <button onClick={()=> loadTemplate('love-letter')}>Love Letter</button>
                      <button onClick={()=> loadTemplate('collage')}>Collage</button>
                      <button onClick={()=> loadTemplate('valentine-card')}>Valentine Card</button>
                    </div>

                    <h4 style={{marginTop:12}}>History</h4>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=> undo()}>Undo</button>
                      <button onClick={()=> redo()}>Redo</button>
                    </div>

                  </div>
                </Side>

                <Main>
                  <A4 ref={pageRef} onClick={()=> setSelected(null)} style={{ background:`rgba(${bg.r},${bg.g},${bg.b},${bg.a})`, padding:'20mm' }}>
                    {elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).map(el=>{
                      const style = { position:'absolute', left:el.x, top:el.y, width:el.width, height:el.height, zIndex:el.z, cursor:'grab', borderRadius: el.radius||0 };
                      if(el.type==='image'){
                        let content = <img className="element-img" src={el.src} style={{ filter: el.filter||filter.name==='none'?'':`${filter.name}(${filter.value}) ${el.filter||''}` }} />;
                        if(el.frame==='polaroid') content = <div className="frame-polaroid" style={{width:'100%',height:'100%'}}>{content}</div>;
                        if(el.frame==='pink') content = <div style={{padding:8, background:'linear-gradient(180deg,#fff0f6,#fff)', borderRadius:12}}>{content}</div>;
                        if(el.frame==='heart') content = <div style={{clipPath:'circle(50% at 50% 50%)'}}>{content}</div>;
                        return <div id={'el-'+el.id} key={el.id} style={style} onClick={(e)=>{e.stopPropagation(); setSelected(el.id);}}>{content}</div>;
                      }
                      if(el.type==='text'){
                        return <div id={'el-'+el.id} key={el.id} style={{...style, color:el.color||'#000', fontSize:el.size+'px', fontFamily:el.font||fontFamily}} onClick={(e)=>{e.stopPropagation(); setSelected(el.id);}} contentEditable suppressContentEditableWarning onInput={(e)=> setElements(prev=> prev.map(p=> p.id===el.id? {...p, text:e.currentTarget.innerText}:p))>{el.text}</div>
                      }
                      if(el.type==='icon'){
                        return <div id={'el-'+el.id} key={el.id} style={{...style, fontSize: Math.min(el.width, el.height)*0.7}} onClick={(e)=>{e.stopPropagation(); setSelected(el.id);}}>{el.icon}</div>
                      }
                      return null;
                    })}
                  </A4>
                </Main>
              </Flex>
            </Wrapper>
          )
        }
