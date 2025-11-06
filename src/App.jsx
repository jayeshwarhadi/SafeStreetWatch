import React, { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import axios from 'axios'

// Fix Leaflet icon paths (required when bundling)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png'
})

const STORAGE_KEY = 'crowd_hazards_v1'

function uid() { return Math.random().toString(36).slice(2,9) }

function loadHazards(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  }catch(e){ console.warn(e); return [] }
}
function saveHazards(h){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h))
}

function MapClick({ onClick }){
  useMapEvents({
    click(e){ onClick(e.latlng) }
  })
  return null
}

export default function App(){
  const [hazards, setHazards] = useState(()=>loadHazards())
  const [selectedPos, setSelectedPos] = useState(null)
  const [form, setForm] = useState({title:'',description:'',category:'pothole',photo:null})
  const [center, setCenter] = useState({lat:20.5937, lng:78.9629}) // India center default
  const [status, setStatus] = useState('')
  const fileRef = useRef()

  useEffect(()=>{ saveHazards(hazards) }, [hazards])

  useEffect(()=>{
    // try geolocation on load
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos=>{
        setCenter({lat: pos.coords.latitude, lng: pos.coords.longitude})
      }, ()=>{/*ignore errors*/})
    }
  },[])

  function handleMapClick(latlng){
    setSelectedPos(latlng)
    setForm({title:'',description:'',category:'pothole',photo:null})
  }

  async function addHazard(e){
    e.preventDefault()
    if(!selectedPos){ setStatus('Click map to pick location first'); return }
    const h = {
      id: uid(),
      lat: selectedPos.lat,
      lng: selectedPos.lng,
      title: form.title || 'Untitled',
      description: form.description || '',
      category: form.category,
      votes: 0,
      resolved: false,
      createdAt: new Date().toISOString(),
      photo: form.photo
    }
    const next = [h, ...hazards]
    setHazards(next)
    setSelectedPos(null)
    setStatus('Saved locally (localStorage)')

    // Optional: try to sync to serverless function if available
    try{
      if(process.env.NETLIFY && window.location.hostname !== 'localhost'){
        // attempt a best-effort sync
        await axios.post('/.netlify/functions/syncHazards', { action: 'save', hazard: h }, { timeout: 3000 })
        setStatus(s=>s + ' • Synced to server')
      }
    }catch(err){ /* don't block user */ }
  }

  function onPhotoChange(file){
    if(!file) return
    const reader = new FileReader()
    reader.onload = ()=> setForm(f=> ({...f, photo: reader.result}))
    reader.readAsDataURL(file)
  }

  function vote(id){
    setHazards(hazards.map(h=> h.id===id ? {...h, votes: h.votes+1} : h))
  }
  function toggleResolved(id){
    setHazards(hazards.map(h=> h.id===id ? {...h, resolved: !h.resolved} : h))
  }
  function remove(id){ if(!confirm('Delete hazard?')) return; setHazards(hazards.filter(h=>h.id!==id)) }

  function exportJSON(){
    const blob = new Blob([JSON.stringify(hazards, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'hazards.json'; a.click(); URL.revokeObjectURL(url)
  }

  function importJSON(file){
    const reader = new FileReader()
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result)
        if(Array.isArray(data)){
          setHazards(data.concat(hazards))
          setStatus('Imported hazards — merged with local list')
        }else setStatus('Invalid file')
      }catch(e){ setStatus('Invalid JSON') }
    }
    reader.readAsText(file)
  }

  async function tryServerSync(){
    try{
      const res = await axios.get('/.netlify/functions/syncHazards')
      if(res.data && res.data.hazards) {
        // simple merge: add those that don't exist
        const remote = res.data.hazards
        const existingIds = new Set(hazards.map(h=>h.id))
        const toAdd = remote.filter(r=>!existingIds.has(r.id))
        if(toAdd.length) setHazards(prev=> [...toAdd, ...prev])
        setStatus('Pulled from server: ' + remote.length)
      }else setStatus('No server data')
    }catch(e){ setStatus('No server sync available') }
  }

  return (
    <div className="container">
      <div className="header">
        <h1 style={{margin:0}}>Crowdsourced Road Hazard Map</h1>
        <div style={{display:'flex',gap:8}}>
          <button className="smallbtn" onClick={()=>{navigator.geolocation && navigator.geolocation.getCurrentPosition(p=>setCenter({lat:p.coords.latitude,lng:p.coords.longitude}))}}>Go to my location</button>
          <button className="btn" onClick={exportJSON}>Export JSON</button>
          <button className="smallbtn" onClick={()=>fileRef.current && fileRef.current.click()}>Import JSON</button>
          <input type="file" accept="application/json" style={{display:'none'}} ref={fileRef} onChange={e=>importJSON(e.target.files[0])} />
        </div>
      </div>

      <div className="card" style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:12}}>
        <div>
          <div className="mapWrap">
            <MapContainer center={[center.lat, center.lng]} zoom={13} style={{height:'100%', width:'100%'}}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {hazards.map(h=> (
                <Marker key={h.id} position={[h.lat, h.lng]}>
                  <Popup>
                    <strong>{h.title}</strong><br/>
                    <em>{h.category}</em><br/>
                    <div style={{maxWidth:240}}>{h.description}</div>
                    {h.photo && <img src={h.photo} alt="photo" style={{maxWidth:200,marginTop:8,borderRadius:6}} />}
                    <div style={{marginTop:8}}>
                      <button className="smallbtn" onClick={()=>vote(h.id)}>▲ {h.votes}</button>
                      <button className="smallbtn" onClick={()=>toggleResolved(h.id)} style={{marginLeft:8}}> {h.resolved? 'Unresolve':'Resolve'}</button>
                    </div>
                  </Popup>
                </Marker>
              ))}
              <MapClick onClick={handleMapClick} />
            </MapContainer>
          </div>
          <div style={{marginTop:10}} className="controls">
            <div style={{flex:1}}>
              <div style={{padding:8}} className="card">
                <div style={{fontSize:13,color:'#bcd'}}>Click anywhere on the map to choose a location for a new hazard. Then fill form and click Add.</div>
                <hr style={{opacity:0.06,margin:'8px 0'}} />
                <form onSubmit={addHazard}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 140px',gap:8}}>
                    <input placeholder="Title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
                    <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                      <option style={{color:'black'}} value="pothole">Pothole</option>
                      <option style={{color:'black'}} value="flood">Flood</option>
                      <option style={{color:'black'}} value="accident">Accident</option>
                      <option style={{color:'black'}} value="debris">Debris</option>
                      <option style={{color:'black'}} value="other">Other</option>
                    </select>
                  </div>
                  <textarea placeholder="Description (optional)" rows={3} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{marginTop:8}} />
                  <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}>
                    <input type="file" accept="image/*" onChange={e=>onPhotoChange(e.target.files[0])} />
                    <div style={{fontSize:12,color:'#9fb'}}>Selected: {selectedPos ? `${selectedPos.lat.toFixed(4)}, ${selectedPos.lng.toFixed(4)}` : 'none'}</div>
                  </div>
                  {form.photo && <img className="photoThumb" src={form.photo} alt="thumb" />}
                  <div style={{display:'flex',gap:8,marginTop:8}}>
                    <button className="btn" type="submit">Add hazard</button>
                    <button type="button" className="smallbtn" onClick={()=>setSelectedPos(null)}>Cancel</button>
                    <button type="button" className="smallbtn" onClick={tryServerSync}>Pull from server</button>
                  </div>
                </form>
              </div>
            </div>

            <div style={{width:320}}>
              <div className="card">
                <h3 style={{marginTop:0}}>Reported hazards</h3>
                <div className="list">
                  {hazards.length===0 && <div style={{padding:12}}>No hazards. Click the map to add one.</div>}
                  {hazards.map(h=> (
                    <div className="hazard" key={h.id}>
                      <strong>{h.title}</strong> <small style={{opacity:0.7}}>({h.category})</small>
                      <div style={{fontSize:12,opacity:0.9}}>{h.description}</div>
                      <div style={{display:'flex',gap:6,marginTop:8}}>
                        <button className="smallbtn" onClick={()=>{ setCenter({lat:h.lat,lng:h.lng}); window.scrollTo(0,0); }}>View</button>
                        <button className="smallbtn" onClick={()=>vote(h.id)}>▲ {h.votes}</button>
                        <button className="smallbtn" onClick={()=>toggleResolved(h.id)}>{h.resolved? 'Unresolve' : 'Resolve'}</button>
                        <button className="smallbtn" onClick={()=>remove(h.id)}>Delete</button>
                      </div>
                      <div style={{fontSize:11,opacity:0.6,marginTop:6}}>Added {new Date(h.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        <div>
          <div className="card">
            <h3>Community Engagement Project on Road Safety</h3>
            <p style={{marginTop:6,fontSize:13}}>By team Jayesh Warhadi , Rohan Ghevande , Chaitanya Gadhave and Siddhesh Durgude</p>
            <p style={{fontSize:13}}>This is an Crowd Sourced Project where the community can flag Hazards on road related to Potholes , Flooding , Accident , Debries or any other hazards. which will help other people travel safely.
            </p>
            <div style={{marginTop:8}}><strong>Status:</strong> {status}</div>
          </div>

          <div style={{height:12}} />
          <div className="card">
            <h4>Features</h4>
            <ul style={{margin:'6px 0 0 18px'}}>
              <li>Add and view road hazards on an interactive map</li>
              <li>Each hazard: title, description, category, photo (optional), votes, resolved state</li>
              <li>Users can upvote or mark hazards resolved</li>
              <li>Map: uses react-leaflet (OpenStreetMap)</li>
            </ul>
          </div>
        </div>
      </div>

      <footer style={{marginTop:12,opacity:0.7,textAlign:'center'}}>Built by Leaflet , React and Netlify.</footer>
    </div>
  )
}