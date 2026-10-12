const express=require('express');
const {createClient}=require('@supabase/supabase-js');

const app=express();
app.use(express.json());
app.use(express.static('public'));

const supabase=createClient(
 process.env.SUPABASE_URL || '',
 process.env.SUPABASE_KEY || ''
);

app.get('/api/devices',async(req,res)=>{
 const {data,error}=await supabase.from('devices').select('*');
 if(error) return res.json({error:error.message});
 res.json(data||[]);
});

app.listen(process.env.PORT||3000);
