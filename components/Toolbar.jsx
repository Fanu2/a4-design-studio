import React from 'react';
export default function Toolbar({onAddText,onAddHeart,onUpload,onExportPNG,onExportPDF}){
  return (<div style={{display:'flex',gap:8,alignItems:'center'}}>
    <button onClick={onAddText} style={{background:'#ff4d8d',color:'#fff',padding:'8px 12px',borderRadius:8}}>Add Text</button>
    <button onClick={onAddHeart} style={{padding:'8px 12px',borderRadius:8}}>Add Heart</button>
    <button onClick={onUpload} style={{padding:'8px 12px',borderRadius:8}}>Upload Image</button>
    <button onClick={onExportPNG} style={{background:'#e11d48',color:'#fff',padding:'8px 12px',borderRadius:8}}>Export PNG</button>
    <button onClick={onExportPDF} style={{background:'#111827',color:'#fff',padding:'8px 12px',borderRadius:8}}>Export PDF</button>
  </div>)
}
