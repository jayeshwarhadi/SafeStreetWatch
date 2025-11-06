// netlify/functions/syncHazards/index.js
// Optional serverless function: simple example showing how to persist/fetch hazards to MongoDB Atlas
// Put this file at: netlify/functions/syncHazards/index.js
const { MongoClient } = require('mongodb')
const uri = process.env.MONGODB_URI
let cachedClient = null

async function connect(){
  if(cachedClient) return cachedClient
  if(!uri) throw new Error('No MONGODB_URI configured')
  const client = new MongoClient(uri)
  await client.connect()
  cachedClient = client
  return client
}

exports.handler = async function(event, context){
  // Simple handler: POST to save hazard, GET to fetch all
  try{
    const client = await connect()
    const db = client.db(process.env.MONGODB_DB || 'crowdhazards')
    const col = db.collection('hazards')

    if(event.httpMethod === 'GET'){
      const docs = await col.find({}).sort({createdAt:-1}).limit(500).toArray()
      return { statusCode: 200, body: JSON.stringify({ hazards: docs }) }
    }

    if(event.httpMethod === 'POST'){
      const body = JSON.parse(event.body)
      if(body.action === 'save' && body.hazard){
        await col.updateOne({ id: body.hazard.id }, { $set: body.hazard }, { upsert: true })
        return { statusCode: 200, body: JSON.stringify({ ok:true }) }
      }
    }

    return { statusCode: 400, body: JSON.stringify({ error:'bad request' }) }
  }catch(err){
    console.error(err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}