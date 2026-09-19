chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(msg?.type==='READ_CLIPBOARD'){
    (async()=>{try{const text=await navigator.clipboard.readText();sendResponse({ok:true,text:String(text||'')});}catch(err){sendResponse({ok:false,error:err?.message||'Não foi possível ler a área de transferência.'});}})();
    return true;
  }

  if(msg?.type==='CROP_SCREENSHOT_TO_DATA_URL'){
    (async()=>{
      try{
        const shot=String(msg.screenshot||'');
        const r=msg.rect||{};
        const dpr=Math.max(1,Math.min(4,Number(msg.dpr||1)));
        const blob=await (await fetch(shot)).blob();
        const bitmap=await createImageBitmap(blob);
        const sx=Math.max(0,Math.round(Number(r.x||0)*dpr));
        const sy=Math.max(0,Math.round(Number(r.y||0)*dpr));
        const sw=Math.min(bitmap.width-sx,Math.round(Number(r.width||0)*dpr));
        const sh=Math.min(bitmap.height-sy,Math.round(Number(r.height||0)*dpr));
        if(sw<80 || sh<80) throw new Error('Área da imagem inválida.');
        const max=900;
        const scale=Math.min(1,max/Math.max(sw,sh));
        const w=Math.max(1,Math.round(sw*scale));
        const h=Math.max(1,Math.round(sh*scale));
        const canvas=new OffscreenCanvas(w,h);
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.drawImage(bitmap,sx,sy,sw,sh,0,0,w,h);
        bitmap.close();
        let out=await canvas.convertToBlob({type:'image/jpeg',quality:.86});
        if(out.size>900000) out=await canvas.convertToBlob({type:'image/jpeg',quality:.68});
        if(out.size>950000) throw new Error('Imagem recortada ficou muito grande.');
        const buf=await out.arrayBuffer();
        const bytes=new Uint8Array(buf);
        let binary='';
        for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
        sendResponse({ok:true,dataUrl:`data:image/jpeg;base64,${btoa(binary)}`,width:w,height:h,bytes:out.size});
      }catch(err){sendResponse({ok:false,error:err?.message||'Falha ao recortar a imagem da tela.'});}
    })();
    return true;
  }

  if(msg?.type==='FETCH_IMAGE_DATA_URL'){
    (async()=>{
      try{
        const url=String(msg.url||'').trim();
        if(!/^https:\/\/(?:[^/]+\.)?(?:[^/]+\.)?(?:amazon\.com|amazon\.com\.br|media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com|images\.amazon\.com)\//i.test(url)) throw new Error('Imagem fora dos domínios permitidos.');
        const r=await fetch(url,{credentials:'omit',cache:'no-store'});
        if(!r.ok) throw new Error(`Amazon respondeu ${r.status}.`);
        const blob=await r.blob();
        if(!blob.type.startsWith('image/')) throw new Error('O endereço não retornou uma imagem.');
        if(blob.size>6000000) throw new Error('Imagem muito grande.');
        const bitmap=await createImageBitmap(blob);
        const max=800;
        const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
        const w=Math.max(1,Math.round(bitmap.width*scale));
        const h=Math.max(1,Math.round(bitmap.height*scale));
        const canvas=new OffscreenCanvas(w,h);
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.drawImage(bitmap,0,0,w,h);
        bitmap.close();
        let out=await canvas.convertToBlob({type:'image/jpeg',quality:.72});
        if(out.size>900000){
          out=await canvas.convertToBlob({type:'image/jpeg',quality:.58});
        }
        if(out.size>900000) throw new Error('Imagem processada ficou muito grande.');
        const buf=await out.arrayBuffer();
        const bytes=new Uint8Array(buf);
        let binary='';
        for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
        sendResponse({ok:true,dataUrl:`data:image/jpeg;base64,${btoa(binary)}`,width:w,height:h,bytes:out.size});
      }catch(err){sendResponse({ok:false,error:err?.message||'Falha ao capturar a imagem.'});}
    })();
    return true;
  }
});