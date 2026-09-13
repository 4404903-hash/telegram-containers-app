require('dotenv').config();
(async()=>{
  if(!process.env.BOT_TOKEN || !/^https:\/\//.test(process.env.APP_URL||''))throw Error('Set BOT_TOKEN and HTTPS APP_URL in .env');
  const r=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/setChatMenuButton`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({menu_button:{type:'web_app',text:'Автобазар',web_app:{url:process.env.APP_URL}}})});
  const result=await r.json();if(!result.ok)throw Error(result.description);
  console.log('Кнопку «Автобазар» встановлено. Відкрийте бота в Telegram.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
