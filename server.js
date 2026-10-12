const express=require('express');
const app=express();
app.use(express.json());
app.use(express.static('public'));

app.post('/api/login',(req,res)=>{
 const {username,password}=req.body;
 if(username==='admin' && password==='123456'){
   return res.json({ok:true});
 }
 res.json({ok:false});
});

app.listen(process.env.PORT||3000);
