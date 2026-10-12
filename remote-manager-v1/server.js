const express=require("express");
const app=express();
app.use(express.static("public"));
app.get("/api/status",(req,res)=>res.json({ok:true}));
app.listen(process.env.PORT||3000);
