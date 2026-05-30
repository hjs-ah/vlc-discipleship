import { useState, useCallback, useEffect, useRef } from "react";

// --- BRAND TOKENS ---
const T = {
  bg:"#F8F7F4", surface:"#FFFFFF", surfaceAlt:"#F2F0EC",
  border:"#E2DDD6", borderMid:"#CCC8BF",
  navy:"#1B3252", navyMid:"#2B5080", navyLight:"#E8EFF7",
  gold:"#B8892A", goldLight:"#FDF5E6",
  green:"#1D6B42", greenLight:"#EAF5EE",
  purple:"#5B2C7A", purpleLight:"#F3EBF9",
  rust:"#7A3318", rustLight:"#FAF0EB",
  text:"#1A1A1A", textMid:"#4A4A4A", textSub:"#7A7670",
  red:"#C0392B", amber:"#D97706", amberLight:"#FEF3C7",
};

// --- CONFIG ---
// Fill these in before deploying. Leave null to run in local/demo mode.
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RESEND_KEY    = import.meta.env.VITE_RESEND_KEY;
const ADMIN_EMAIL   = import.meta.env.VITE_ADMIN_EMAIL;
const NOTION_TOKEN  = import.meta.env.VITE_NOTION_TOKEN;
const NOTION_DB_ID  = "d90b58836a1e49f5ba51f6bc8969b412"; // D2D Curriculum Feedback Log -- https://www.notion.so/d90b58836a1e49f5ba51f6bc8969b412
const ADMIN_PIN     = import.meta.env.VITE_ADMIN_PIN ?? "1234";

// --- SUPABASE HELPERS ---
async function sbFetch(path, opts = {}) {
  if (!SUPABASE_URL) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}`,
        "Content-Type":"application/json", Prefer:"return=representation" },
      ...opts,
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

// --- SUPABASE AUTH ---
// Reads the current Supabase session and returns the matching profile row.
// Returns null if not authenticated (anonymous/testing mode).
async function getSessionProfile() {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    // Get session from Supabase Auth
    const sessionRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!sessionRes.ok) return null;
    const user = await sessionRes.json();
    if (!user?.id) return null;
    // Fetch their profile
    const rows = await sbFetch(`profiles?id=eq.${user.id}&select=id,full_name,email,avatar_url,role`);
    return rows?.[0] || null;
  } catch { return null; }
}

// --- RESEND EMAIL ---
async function sendAdminEmail(entry, moduleName) {
  if (!RESEND_KEY || !ADMIN_EMAIL) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{ Authorization:`Bearer ${RESEND_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({
        from:"VLC Curriculum Tool <curriculum@vlc.app>",
        to: ADMIN_EMAIL,
        subject:`[VLC] New ${entry.type} -- ${moduleName}`,
        html:`<p><strong>${entry.author}</strong> submitted a <strong>${entry.type}</strong> on <em>${moduleName}</em>.</p>
              <blockquote>${entry.body}</blockquote>
              ${entry.field ? `<p>Field: <strong>${entry.field}</strong></p>` : ""}
              <p>Review it in the curriculum tool.</p>`,
      }),
    });
  } catch {}
}

// --- NOTION SYNC ---
async function syncToNotion(entry, moduleName) {
  if (!NOTION_TOKEN || !NOTION_DB_ID) return;
  try {
    await fetch("https://api.notion.com/v1/pages", {
      method:"POST",
      headers:{ Authorization:`Bearer ${NOTION_TOKEN}`, "Content-Type":"application/json",
        "Notion-Version":"2022-06-28" },
      body: JSON.stringify({
        parent:{ database_id: NOTION_DB_ID },
        properties:{
          Name:{ title:[{ text:{ content:`${entry.type} -- ${moduleName}` }}]},
          Author:{ rich_text:[{ text:{ content: entry.author }}]},
          Type:{ select:{ name: entry.type }},
          Module:{ rich_text:[{ text:{ content: moduleName }}]},
          Field:{ rich_text:[{ text:{ content: entry.field||"" }}]},
          Body:{ rich_text:[{ text:{ content: entry.body }}]},
          Status:{ select:{ name: entry.status }},
          Date:{ date:{ start: new Date().toISOString() }},
        },
      }),
    });
  } catch {}
}

// --- FALLBACK FACILITATORS (used when Supabase not connected) ---
const DEFAULT_FACILITATORS = [
  { id:"A", name:"Antone Holmes",     initials:"AH", color:T.navy,   light:T.navyLight,   avatarUrl:null },
  { id:"B", name:"Marquia Holmes",    initials:"MH", color:T.green,  light:T.greenLight,  avatarUrl:null },
  { id:"C", name:"Vanessa Wilkerson", initials:"VW", color:T.purple, light:T.purpleLight, avatarUrl:null },
  { id:"D", name:"George Sephes",     initials:"GS", color:T.rust,   light:T.rustLight,   avatarUrl:null },
];

// --- MODULES ---
const DEFAULT_MODULES = [
  { num:1,  month:"Month 1",  title:"Foundations of Discipleship",      theme:"Who Is a Disciple?",           scripture:"Matthew 28:18-20",                       color:T.navy,
    topics:[{main:"Definition & Importance of Discipleship",subs:["Personal follower of Jesus during His life","Believes His doctrine, rests on His sacrifice, embodies His spirit","Patterns after Christ -- Matthew 10:24"]},{main:"The Great Commission",subs:["Matthew 28:18-20 -- foundational mandate","Name of Christ-followers in the Gospels (Matt. 10:1; 11:1; 12:1)"]},{main:"Class Covenant & Community Agreements",subs:["Expectations, accountability, group norms"]}],
    delivery:["Teaching + whiteboard (30 min)","Group discussion: 'What does a disciple look like today?'","Icebreaker: name + one word for your journey","Video clip review","Journaling prompt"],
    memorization:"Matthew 28:19-20", assignments:["Read Matthew 10:1-12:1; mark every 'disciple' reference","Reflection journal: Your spiritual journey (1-2 pages)"],
    lms:"Welcome video . Class covenant PDF . Week 1 reading guide . Matching quiz", lead:"A", support:"B" },

  { num:2,  month:"Month 2",  title:"Understanding Salvation",            theme:"The Gospel Foundation",        scripture:"John 3:16 | Romans 5:8 | Ephesians 2:8", color:T.navyMid,
    topics:[{main:"The Gospel Message",subs:["God's love & purpose (John 3:16)","The problem of sin (Romans 3:23; 6:23)","God's solution -- Jesus Christ (Romans 5:8; John 14:6)","Our response -- faith & repentance (Romans 10:9; Ephesians 2:8)"]},{main:"Conversion",subs:["A process of turning toward God","Involves mind, affection, and will","Saul to Paul -- Acts 7, 8, 22"]},{main:"Baptism",subs:["Biblical basis & command (Matthew 28:19)","Identification, cleansing, public declaration","Entry into God's family (1 Corinthians 12:13)"]},{main:"Eternal Life & Assurance",subs:["2 Corinthians 5:17 -- new creation","1 John 5:11 -- God has given us eternal life"]}],
    delivery:["Presentation with slides (35 min)","Gospel bridge diagram exercise","Small groups: Share salvation story (3 min each)","Baptism Q&A panel","Video: Saul's conversion dramatization"],
    memorization:"Romans 10:9 & John 3:16", assignments:["Write personal salvation testimony (before/encounter/after)","Gospel message fill-in-the-blank quiz"],
    lms:"Gospel outline PDF . Baptism study guide . Testimony submission", lead:"B", support:"C" },

  { num:3,  month:"Month 3",  title:"Developing a Relationship with God", theme:"Prayer, Bible Study & Worship", scripture:"Jeremiah 33:3 | Philippians 4:6",         color:T.green,
    topics:[{main:"Prayer",subs:["Direct connection with God (Jeremiah 33:3)","Jesus' example of daily prayer (Luke 5:16)","ACTS model: Adoration, Confession, Thanksgiving, Supplication","Communal, spiritual warfare, confession, gratitude dimensions"]},{main:"Bible Study",subs:["9-step approach: prayer -> context -> tools -> reflection -> application","Reliable translations: KJV, NIV, ESV, NLT","Resources: YouVersion, Blue Letter Bible, commentaries"]},{main:"Worship & Reverence",subs:["Forms: praise, action, heart (John 4:24)","Reverence: fear of the Lord, humility, obedience (Proverbs 9:10)"]}],
    delivery:["Guided corporate prayer to open","Teaching on ACTS model","Bible study demonstration through a passage","Worship segment (10 min congregational)","Partner prayer practice"],
    memorization:"Jeremiah 33:3 & Philippians 4:6", assignments:["Daily prayer log for one week","Bible study journal: apply 9 steps to one chapter"],
    lms:"Prayer log template . Bible study worksheet . Apps list . Prayer categories quiz", lead:"C", support:"D" },

  { num:4,  month:"Month 4",  title:"The Holy Spirit",                    theme:"Empowered for Life",           scripture:"John 14:26 | Galatians 5:22-23",         color:T.purple,
    topics:[{main:"Roles of the Holy Spirit",subs:["Teaches & reminds (John 14:26)","Grieves (Ephesians 4:30) -- has a will (1 Cor. 12:11)","Conviction, regeneration, indwelling, sanctification, guidance"]},{main:"Spiritual Gifts",subs:["Wisdom, knowledge, faith, healing, miracles, prophecy, discernment","Tongues & interpretation; service, giving, leadership, mercy","Key passages: 1 Corinthians 12 . Romans 12 . Ephesians 4"]},{main:"Fruits of the Spirit",subs:["Galatians 5:22-23: love, joy, peace, patience, kindness","Goodness, faithfulness, gentleness, self-control"]},{main:"Spirit-Filled Living",subs:["Prayer & obedience . bearing fruit . exercising gifts . bold witness"]}],
    delivery:["Teaching with Spirit's roles diagram","Spiritual Gifts Assessment -- 1:1 sessions","Small group: Which fruit needs most growth?","Gift discovery conversation pairs","Creative: illustrate Spirit-filled life"],
    memorization:"Galatians 5:22-23", assignments:["Complete Spiritual Gifts Assessment (LMS)","Journal: How is the Holy Spirit active in your daily life?"],
    lms:"Gifts assessment tool . Fruit of the Spirit chart . Assessment submission", lead:"D", support:"A" },

  { num:5,  month:"Month 5",  title:"Living & Obeying God's Word",        theme:"Holiness, the Law & the Feasts", scripture:"1 Peter 1:16 | Matthew 5:17-18",      color:T.rust,
    topics:[{main:"Holiness & Sanctification",subs:["Set apart for God -- 1 Peter 1:16","Lifelong transformation into Christ's image (1 Thessalonians 4:3)","Steps: Word, prayer, confession, separation from sin, Christlike character"]},{main:"The Ten Commandments",subs:["Matthew 5:17-18 -- Christ fulfilled, not abolished the law","Love for God: Commandments 1-4 (Exodus 20:3-11)","Love for Others: Commandments 5-10 (Exodus 20:12-17)"]},{main:"Biblical Feast Days (Leviticus 23)",subs:["Passover -> Christ's sacrifice . Unleavened Bread -> removing sin","Firstfruits -> resurrection . Pentecost -> Holy Spirit","Trumpets, Day of Atonement, Tabernacles -> future fulfillment"]}],
    delivery:["Teaching with feast day timeline visual","Ten Commandments application workshop (small groups)","Discussion: How do feasts deepen the gospel?","Creative: map each feast to a NT event","Note: breaks scheduled for feast observance this month"],
    memorization:"1 Peter 1:16 & Matthew 5:17", assignments:["Complete feast days chart (name . meaning . NT fulfillment)","Written reflection: How does pursuing holiness change daily choices?"],
    lms:"Feast days chart . Ten Commandments worksheet . Holiness quiz", lead:"A", support:"B" },

  { num:6,  month:"Month 6",  title:"Fellowship & Community",             theme:"The Body of Christ",           scripture:"Hebrews 10:24-25 | 1 Corinthians 12",    color:T.navy,
    topics:[{main:"The Church",subs:["Christ as head (Ephesians 1:22-23)","Early Christian community model (Acts 2:42-47)","Functions: worship, teaching, community, mission"]},{main:"Building Relationships",subs:["One Body -- interconnected (1 Corinthians 12:12-27)","Love one another (John 13:34-35)","Accountability, encouragement, growth through community"]},{main:"Serving with Spiritual Gifts",subs:["Discovering and deploying your gifts (1 Peter 4:10)","In the Church: teaching, worship, children's ministry","In the community: feeding the hungry, visiting the sick"]}],
    delivery:["Teaching on 'one another' commands","Small group: share one struggle + one victory","Church ministry mapping exercise","Service project planning","Accountability partner pairing -- ongoing through year"],
    memorization:"Hebrews 10:24-25", assignments:["Interview a church leader about their ministry role","Commit to a small group or accountability pair"],
    lms:"Ministry gift placement guide . Community reflection . Small group report", lead:"B", support:"C" },

  { num:7,  month:"Month 7",  title:"Evangelism & Mission",               theme:"Sharing Your Faith",           scripture:"Matthew 28:19-20 | Acts 1:8",            color:T.navyMid,
    topics:[{main:"The Great Commission",subs:["Go . make disciples . baptize . teach (Matthew 28:19-20)","God's heart for the lost (2 Peter 3:9)","Assured: Jesus is always with us (Matthew 28:20)"]},{main:"Personal Testimony",subs:["Structure: Before Christ / Encounter / After Christ","Paul's example: Acts 22, 26","Tips: concise, honest, Christ-centered"]},{main:"Methods of Evangelism",subs:["Relational, lifestyle, direct, media/technology, service-based","Practical tools: tracts, YouVersion, social media","Follow-up and ongoing relationship with seekers"]}],
    delivery:["Teaching on the Great Commission","Testimony workshop: draft & refine 3-min testimony","Partner practice: share + receive feedback","Role-play: responding to common objections","Digital evangelism discussion"],
    memorization:"Acts 1:8 & Romans 10:14", assignments:["Finalize and submit written testimony (LMS)","Outreach: share faith with one person; journal the experience"],
    lms:"Testimony template . Evangelism method guide . Outreach journal", lead:"C", support:"D" },

  { num:8,  month:"Month 8",  title:"Spiritual Warfare",                  theme:"Standing Firm",                scripture:"Ephesians 6:10-18 | James 4:7",          color:T.green,
    topics:[{main:"Recognizing Spiritual Battles",subs:["Sources: the enemy, the flesh, the world (Ephesians 6:12)","Signs: unusual temptation, discouragement, conflict"]},{main:"Armor of God (Ephesians 6:10-18)",subs:["Belt of Truth . Breastplate of Righteousness","Shoes of Peace . Shield of Faith","Helmet of Salvation . Sword of the Spirit . Prayer"]},{main:"Overcoming Temptation",subs:["Rely on God's strength (Philippians 4:13)","Resist the devil (James 4:7) . flee sin . seek accountability","God's promise: 1 Corinthians 10:13"]}],
    delivery:["Teaching with Armor of God diagram","Identify a current battle; apply armor to it","Small group prayer using Ephesians 6:18","Discussion: Enemy's tactics in our culture","Group memorization drill: Ephesians 6:10-11"],
    memorization:"Ephesians 6:10-11 & 1 Corinthians 10:13", assignments:["Armor of God daily journal (1 week)","Accountability check-in on one area of temptation"],
    lms:"Armor of God worksheet . Daily journal template . Component quiz", lead:"D", support:"A" },

  { num:9,  month:"Month 9",  title:"Stewardship",                        theme:"Time, Talents & Treasures",    scripture:"2 Corinthians 9:6-7 | Matthew 6:21",    color:T.purple,
    topics:[{main:"Biblical Stewardship",subs:["Time (Psalm 90:12) . Talents (1 Peter 4:10) . Treasures (Matthew 6:21)","Everything belongs to God (Psalm 24:1)"]},{main:"Biblical Principles of Giving",subs:["Why give: obedience, faith, love & gratitude","Cheerfulness, proportionality, regularity, sacrifice (2 Cor. 9:7)","Types: tithes, offerings, alms"]},{main:"Living Generously",subs:["Reflects God's nature (John 3:16)","Cultivate gratitude . give freely . serve actively","Rewards: spiritual growth, eternal impact, personal joy"]}],
    delivery:["Teaching on stewardship as worship","Budget and time audit exercise","Discussion: What makes generosity feel difficult?","Testimony spotlight","Workshop: personal stewardship plan"],
    memorization:"2 Corinthians 9:7 & Matthew 6:21", assignments:["Stewardship audit: track time, spending, service for one week","Draft a personal giving and stewardship commitment"],
    lms:"Stewardship audit template . Giving principles guide . Plan submission", lead:"A", support:"B" },

  { num:10, month:"Month 10", title:"Perseverance in Faith",              theme:"Standing Through Trials",      scripture:"James 1:2-3 | Romans 8:28",             color:T.rust,
    topics:[{main:"Understanding Trials",subs:["God's purpose: strengthen faith, produce perseverance, refine character","James 1:2-3 -- count it all joy","Romans 8:28 -- all things work for good"]},{main:"Maintaining Faith",subs:["Clinging to God's Word (Psalm 119:105)","Practicing gratitude (1 Thessalonians 5:18)","Persevering through worship -- Job 1:21","Remembering past deliverances (Psalm 77:11-12)"]},{main:"Hope of Eternal Life",subs:["Assurance: 1 John 5:11","Motivated by glory: 2 Corinthians 4:17","Sharing this hope with others (Titus 1:2)"]}],
    delivery:["Teaching framed around perseverance testimonies","Lament exercise: praying through a Psalm together","Small group: share a past trial and how God moved","Eternal perspective discussion","Prayer wall: write trials on cards, pray over them"],
    memorization:"James 1:2-3 & Romans 8:28", assignments:["Journal: Where is God in a current or past trial?","Read Romans 8 in full; note every promise for believers"],
    lms:"Perseverance study guide . Romans 8 worksheet . Faithfulness prompt", lead:"B", support:"C" },

  { num:11, month:"Month 11", title:"Developing a Rule of Life",          theme:"Sustainable Spiritual Growth", scripture:"Matthew 6:33 | Philippians 1:6",         color:T.navy,
    topics:[{main:"Personal Spiritual Disciplines",subs:["Daily prayer & devotion (Mark 1:35)","Fasting: drawing closer to God (Matthew 6:16-18)","Journaling & reflection . Sabbath rest (Exodus 20:8-10)"]},{main:"Balancing Life",subs:["God first (Matthew 6:33) . healthy boundaries","Stewardship of all areas . embracing rest","Accountability and fellowship (Proverbs 27:17)"]},{main:"Sustainable Growth Plan",subs:["Define spiritual goals . develop a routine","Use resources: devotionals, guides, podcasts, mentors","Regular self-assessment (2 Corinthians 13:5)","Trust the Holy Spirit -- Philippians 1:6"]}],
    delivery:["Teaching on historic & modern 'rules of life'","Workshop: draft personal rule of life from template","Small group review of drafts","Discussion: gaps in current spiritual practices","Facilitator shares their own rule of life as model"],
    memorization:"Matthew 6:33 & Philippians 1:6", assignments:["Complete and submit Rule of Life document (LMS)","30-day commitment: practice your rule; journal the experience"],
    lms:"Rule of Life template . Spiritual disciplines overview . Document submission", lead:"C", support:"D" },

  { num:12, month:"Month 12", title:"Conclusion & Commissioning",         theme:"Sent as Disciples",            scripture:"Matthew 28:19-20 | 2 Timothy 2:2",      color:T.navyMid,
    topics:[{main:"Year in Review",subs:["Recap all 11 modules: foundation through rule of life","Personal testimonies of growth from participants"]},{main:"The Call to Mentor Others",subs:["2 Timothy 2:2 -- disciple who disciples others","Your next steps in each foundational area","Philippians 1:6 -- He who began a good work will complete it"]},{main:"Commissioning",subs:["Corporate prayer and worship service","Certificate ceremony for completers","Write a letter to a new disciple starting the journey","Introduction to next cohort's facilitator rotation"]}],
    delivery:["Panel discussion: one transformation per participant","Group worship and prayer service","Certificate ceremony","Letter-writing activity","Vision cast: carry it to family, workplace, community"],
    memorization:"2 Timothy 2:2", assignments:["Final reflection: 'How have I grown as a disciple?' (2-3 pages)","Commit to mentoring someone in the next cohort"],
    lms:"Year-in-review guide . Commissioning certificate . Final reflection + mentorship form", lead:"D", support:"A" },
];

// --- SMALL HELPERS ---
function ts() { return new Date().toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }

function Avatar({ fac, size=32 }) {
  if (!fac) return null;
  const s = { width:size, height:size, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.36, fontWeight:700, color:"#fff", overflow:"hidden", border:`2px solid ${fac.color}22` };
  return fac.avatarUrl
    ? <div style={s}><img src={fac.avatarUrl} alt={fac.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none"}} /></div>
    : <div style={{...s, background:fac.color}}>{fac.initials}</div>;
}

function Pill({ fac, role, small }) {
  if (!fac) return null;
  const isLead = role==="lead";
  const sz = small ? 18 : 22;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:small?4:6,
      background:isLead?fac.color:fac.light, color:isLead?"#fff":fac.color,
      border:`1.5px solid ${isLead?fac.color:fac.color+"66"}`,
      borderRadius:20, padding:small?"2px 8px":"3px 11px", fontSize:small?10:11, fontWeight:600 }}>
      <Avatar fac={fac} size={sz} />
      {!small && <span>{isLead?"Lead":"Support"}</span>}
    </span>
  );
}

// --- ADMIN PIN MODAL ---
function AdminPinModal({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const check = () => { if (pin === ADMIN_PIN) { onSuccess(); } else { setErr(true); setPin(""); setTimeout(()=>setErr(false),1500); }};
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:T.surface,borderRadius:12,padding:"28px 32px",maxWidth:340,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize:16,fontWeight:800,color:T.navy,marginBottom:4 }}>Admin Access</div>
        <div style={{ fontSize:12,color:T.textSub,marginBottom:20,lineHeight:1.5 }}>Enter your admin PIN to unlock edit mode. This allows you to directly edit curriculum content and apply approved feedback.</div>
        <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()}
          placeholder="Enter PIN" maxLength={8} autoFocus
          style={{ width:"100%",padding:"10px 12px",border:`2px solid ${err?T.red:T.borderMid}`,borderRadius:8,fontSize:16,
            textAlign:"center",letterSpacing:"0.3em",outline:"none",marginBottom:8,color:T.text,
            background:err?"#FEE2E2":T.bg,transition:"all 0.2s" }} />
        {err && <div style={{ fontSize:11,color:T.red,textAlign:"center",marginBottom:8 }}>Incorrect PIN -- try again</div>}
        <div style={{ display:"flex",gap:8,marginTop:12 }}>
          <button onClick={onCancel} style={{ flex:1,padding:"9px",border:`1px solid ${T.border}`,borderRadius:8,background:"none",cursor:"pointer",fontSize:12,color:T.textMid,fontWeight:600 }}>Cancel</button>
          <button onClick={check} style={{ flex:1,padding:"9px",border:"none",borderRadius:8,background:T.navy,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>Unlock</button>
        </div>
      </div>
    </div>
  );
}

// --- WELCOME MODAL ---
function WelcomeModal({ onClose }) {
  const stepIcons = [
    { bg:T.navyLight,  color:T.navy,   label:"12" },
    { bg:T.purpleLight,color:T.purple, label:"MSG" },
    { bg:T.greenLight, color:T.green,  label:"OK" },
    { bg:T.goldLight,  color:T.gold,   label:"@" },
    { bg:T.surfaceAlt, color:T.textMid,label:"N" },
  ];
  const steps = [
    { title:"Browse the Curriculum", body:"Use the month strip at the top to jump to any module, or browse all 12 cards in the overview. Each card shows the lead facilitator, module theme, and any pending feedback." },
    { title:"Submit Feedback", body:"Use the 'Additional Feedback' panel visible on every module page. Post a comment, submit an edit suggestion, or ask a question. Tag the field you're referencing for clarity." },
    { title:"Feedback is Shared", body:"All facilitators see all feedback entries. The admin reviews, approves, or rejects edit requests. Approved changes are applied to the next deployment." },
    { title:"Admin is Notified", body:"Every new Edit Request triggers an email to the curriculum admin. You don't need to follow up -- just submit and it will be reviewed." },
    { title:"Notion Log", body:"All feedback is mirrored to a shared Notion database anyone can view. Use it as a running record of curriculum decisions across the cohort." },
  ];
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
      <div style={{ background:T.surface,borderRadius:16,maxWidth:560,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden" }}>
        <div style={{ background:T.navy,padding:"24px 28px 18px" }}>
          <div style={{ fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:"0.12em",marginBottom:4 }}>VERITY LEARNING CENTER</div>
          <div style={{ fontSize:22,fontWeight:800,color:"#fff",marginBottom:4 }}>Discipleship Curriculum Workspace</div>
          <div style={{ fontSize:13,color:"rgba(255,255,255,0.7)",lineHeight:1.5 }}>Your facilitator curriculum reference. Browse the 12-month outline, track the rotation schedule, and submit feedback -- all in one place.</div>
        </div>
        <div style={{ padding:"20px 28px" }}>
          <div style={{ fontSize:10,fontWeight:700,color:T.textSub,letterSpacing:"0.1em",marginBottom:14 }}>HOW THIS TOOL WORKS</div>
          <div style={{ display:"flex",flexDirection:"column",gap:11 }}>
            {steps.map((s,i)=>(
              <div key={i} style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
                <div style={{ width:34,height:34,borderRadius:9,
                  background:stepIcons[i].bg,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:800,color:stepIcons[i].color,flexShrink:0,
                  border:`1.5px solid ${stepIcons[i].color}33` }}>
                  {stepIcons[i].label}
                </div>
                <div>
                  <div style={{ fontSize:12,fontWeight:700,color:T.navy,marginBottom:1 }}>{s.title}</div>
                  <div style={{ fontSize:11,color:T.textMid,lineHeight:1.5 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:16,padding:"10px 14px",background:T.goldLight,borderRadius:8,border:`1px solid #DFC98A`,fontSize:11,color:T.textMid,lineHeight:1.5 }}>
            <strong style={{color:T.gold}}>Facilitators:</strong> This view is read-only. Use the Additional Feedback panel to propose any changes. Admin access is required to edit content directly.
          </div>
        </div>
        <div style={{ padding:"0 28px 22px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:11,color:T.textSub }}>Matthew 28:18-20 . 12 Months . Mondays</span>
          <button onClick={onClose} style={{ padding:"9px 22px",background:T.navy,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700 }}>Get Started</button>
        </div>
      </div>
    </div>
  );
}

// --- EDITABLE FIELD ---
function Editable({ value, onChange, multiline, style }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) return (
    <span onClick={()=>{setDraft(value);setEditing(true);}} title="Click to edit"
      style={{ cursor:"text",borderBottom:"1px dashed "+T.borderMid,...style }}>{value}</span>
  );
  const shared = {
    value:draft, onChange:e=>setDraft(e.target.value), autoFocus:true,
    onBlur:()=>{onChange(draft);setEditing(false);},
    onKeyDown:e=>{if(!multiline&&e.key==="Enter"){onChange(draft);setEditing(false);}if(e.key==="Escape")setEditing(false);},
    style:{border:"1.5px solid "+T.navyMid,borderRadius:4,padding:"2px 6px",fontSize:"inherit",fontFamily:"inherit",color:T.text,background:"#F0F4FA",outline:"none",width:"100%",...style},
  };
  return multiline?<textarea rows={2} {...shared}/>:<input {...shared}/>;
}

// --- FEEDBACK PANEL ---
const STATUS_CHIP = { pending:{bg:T.amberLight,text:T.amber}, approved:{bg:T.greenLight,text:T.green}, rejected:{bg:"#FEE2E2",text:T.red} };
const TYPE_CHIP   = { comment:{bg:T.navyLight,text:T.navy}, edit:{bg:T.purpleLight,text:T.purple}, question:{bg:T.goldLight,text:T.gold} };

function FeedbackPanel({ moduleNum, moduleName, logs, onAdd, onStatus, facilitators, isAdmin, compact, sessionUser }) {
  const [name, setName] = useState("");
  const [facId, setFacId] = useState("");
  const [type, setType] = useState("comment");
  const [field, setField] = useState("");
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState("all");
  const bottomRef = useRef(null);

  // If a session user is detected, use them automatically
  const autoName = sessionUser?.full_name || null;
  const autoFacId = sessionUser?.id || null;
  const displayName = autoName || name || "Anonymous";
  const displayFacId = autoFacId || facId;

  const relevantLogs = moduleNum!=null ? logs.filter(l=>l.moduleNum===moduleNum) : logs;
  const filtered = filter==="all" ? relevantLogs : relevantLogs.filter(l=>l.type===filter||l.status===filter);
  const pending = relevantLogs.filter(l=>l.status==="pending").length;

  const [nameError, setNameError] = useState(false);

  const submit = () => {
    if (!body.trim()) return;
    // Block anonymous posts without a name
    if (!autoName && !name.trim()) {
      setNameError(true);
      setTimeout(() => setNameError(false), 2000);
      return;
    }
    const fac = facilitators.find(f=>f.id===displayFacId);
    onAdd({
      id:Date.now(), moduleNum, moduleName,
      author: fac ? fac.name : displayName,
      fac_id: displayFacId || null,
      type, field:field||null, body, status:"pending", createdAt:ts()
    });
    setBody(""); setField(""); setName("");
  };

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[logs.length]);

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:T.surface,borderRadius:compact?0:10,border:compact?"none":`1px solid ${T.border}`,overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"12px 14px 10px",borderBottom:`1px solid ${T.border}`,background:T.surfaceAlt }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <div style={{ fontSize:12,fontWeight:700,color:T.navy }}>
            {moduleNum!=null ? "Additional Feedback" : "All Feedback"}
            {moduleNum!=null && moduleName && <div style={{ fontSize:9,color:T.textSub,fontWeight:400,marginTop:1 }}>{moduleName}</div>}
            {pending>0 && <span style={{ marginLeft:6,fontSize:9,background:T.amber,color:"#fff",borderRadius:20,padding:"1px 7px",fontWeight:700 }}>{pending} pending</span>}
          </div>
        </div>
        <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
          {["all","comment","edit","question","pending","approved"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{ fontSize:9,padding:"2px 7px",borderRadius:20,border:`1px solid ${filter===f?T.navyMid:T.border}`,
                background:filter===f?T.navyLight:"transparent",color:filter===f?T.navy:T.textSub,cursor:"pointer",fontWeight:600 }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Log */}
      <div style={{ flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:7 }}>
        {filtered.length===0 && <div style={{ textAlign:"center",padding:"28px 0",color:T.textSub,fontSize:12 }}>No entries yet.</div>}
        {filtered.map(log=>{
          const tc=TYPE_CHIP[log.type]||TYPE_CHIP.comment;
          const sc=STATUS_CHIP[log.status]||STATUS_CHIP.pending;
          const fac=facilitators.find(f=>f.id===log.facId);
          return (
            <div key={log.id} style={{ background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 11px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5,flexWrap:"wrap",gap:4 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                  {fac && <Avatar fac={fac} size={20} />}
                  <span style={{ fontWeight:700,fontSize:11,color:T.text }}>{log.author}</span>
                  <span style={{ fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20,background:tc.bg,color:tc.text }}>{log.type}</span>
                  {log.field && <span style={{ fontSize:9,padding:"1px 6px",borderRadius:20,background:T.purpleLight,color:T.purple,fontWeight:600 }}>re: {log.field}</span>}
                  {moduleNum==null && log.moduleName && <span style={{ fontSize:9,padding:"1px 6px",borderRadius:20,background:T.navyLight,color:T.navy,fontWeight:600 }}>{log.moduleName}</span>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                  <span style={{ fontSize:9,color:T.textSub }}>{log.createdAt}</span>
                  <span style={{ fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20,background:sc.bg,color:sc.text }}>{log.status}</span>
                </div>
              </div>
              <div style={{ fontSize:11,color:T.textMid,lineHeight:1.5 }}>{log.body}</div>
              {isAdmin && log.status==="pending" && (
                <div style={{ display:"flex",gap:5,marginTop:6 }}>
                  <button onClick={()=>onStatus(log.id,"approved")}
                    style={{ fontSize:10,padding:"2px 9px",borderRadius:20,border:`1px solid ${T.green}`,background:T.greenLight,color:T.green,cursor:"pointer",fontWeight:600 }}>Approve</button>
                  <button onClick={()=>onStatus(log.id,"rejected")}
                    style={{ fontSize:10,padding:"2px 9px",borderRadius:20,border:`1px solid ${T.red}`,background:"#FEE2E2",color:T.red,cursor:"pointer",fontWeight:600 }}>Reject</button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Composer */}
      <div style={{ padding:"10px 12px",borderTop:`1px solid ${T.border}`,background:T.surfaceAlt }}>
        <div style={{ display:"flex",gap:5,marginBottom:6,flexWrap:"wrap" }}>
          {autoName ? (
            /* Authenticated -- show name badge, no input needed */
            <div style={{ display:"flex",alignItems:"center",gap:6,flex:"1 1 130px",
              background:T.navyLight,border:`1px solid ${T.navyMid}44`,borderRadius:6,padding:"4px 8px" }}>
              {/* Show avatar from facilitator list, or fallback to sessionUser directly */}
              {(facilitators.find(f=>f.id===autoFacId) || sessionUser) &&
                <Avatar fac={facilitators.find(f=>f.id===autoFacId) || {
                  initials: sessionUser?.initials || (autoName||"?").split(" ").map(w=>w[0]).join("").toUpperCase(),
                  color: sessionUser?.color || T.navy,
                  avatarUrl: sessionUser?.avatarUrl || sessionUser?.avatar_url || null,
                }} size={18}/>}
              <span style={{ fontSize:11,fontWeight:600,color:T.navy }}>{autoName}</span>
              <span style={{ fontSize:9,color:T.textSub,marginLeft:"auto" }}>
                {sessionUser?.role === "admin" ? "admin" : "signed in"}
              </span>
            </div>
          ) : (
            /* Anonymous mode -- name required before posting */
            <div style={{ display:"flex",flexDirection:"column",gap:2,flex:"1 1 130px" }}>
              <label style={{ fontSize:9,fontWeight:700,color:T.red,letterSpacing:"0.08em" }}>
                NAME REQUIRED
              </label>
              <input
                value={name}
                onChange={e=>setName(e.target.value)}
                placeholder="Enter your name to comment"
                maxLength={60}
                style={{ width:"100%",padding:"5px 7px",
                  border:`1.5px solid ${name.trim() ? T.borderMid : T.red}`,
                  borderRadius:6,fontSize:11,
                  background: name.trim() ? T.surface : "#FEF2F2",
                  outline:"none",color:T.text,transition:"border-color 0.15s,background 0.15s" }}
              />
              {nameError && (
                <span style={{ fontSize:9,color:T.red,fontWeight:600 }}>
                  Please enter your name before posting.
                </span>
              )}
            </div>
          )}
          <select value={type} onChange={e=>setType(e.target.value)}
            style={{ flex:"0 0 110px",padding:"5px 7px",border:`1px solid ${T.borderMid}`,borderRadius:6,fontSize:11,background:T.surface,outline:"none",color:T.text }}>
            <option value="comment">Comment</option>
            <option value="edit">Edit Request</option>
            <option value="question">Question</option>
          </select>
          {type==="edit" && (
            <input value={field} onChange={e=>setField(e.target.value)} placeholder="Field (e.g. delivery)"
              style={{ flex:"1 1 120px",padding:"5px 7px",border:`1px solid ${T.borderMid}`,borderRadius:6,fontSize:11,background:T.surface,outline:"none",color:T.text }} />
          )}
        </div>
        <div style={{ display:"flex",gap:6 }}>
          <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Add a comment, edit suggestion, or question..." rows={2}
            style={{ flex:1,padding:"6px 8px",border:`1px solid ${T.borderMid}`,borderRadius:6,fontSize:11,background:T.surface,outline:"none",resize:"none",color:T.text,fontFamily:"inherit" }}/>
          <button onClick={submit}
            disabled={!autoName && !name.trim() && !body.trim()}
            style={{ padding:"0 14px",
              background: (!autoName && !name.trim()) ? T.red : T.navy,
              color:"#fff",border:"none",borderRadius:6,
              cursor: (!autoName && !name.trim()) ? "not-allowed" : "pointer",
              fontSize:11,fontWeight:600,alignSelf:"stretch",
              opacity: (!autoName && !name.trim()) ? 0.6 : 1,
              transition:"background 0.15s,opacity 0.15s" }}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MODULE CARD ---
function ModuleCard({ mod, onUpdate, editMode, facilitators }) {
  const [openTopic, setOpenTopic] = useState(null);
  const upd=(f,v)=>onUpdate({...mod,[f]:v});
  const updTopic=(ti,f,v)=>onUpdate({...mod,topics:mod.topics.map((t,i)=>i===ti?{...t,[f]:v}:t)});
  const updSub=(ti,si,v)=>onUpdate({...mod,topics:mod.topics.map((t,i)=>i===ti?{...t,subs:t.subs.map((s,j)=>j===si?v:s)}:t)});
  const updList=(f,idx,v)=>onUpdate({...mod,[f]:mod[f].map((x,i)=>i===idx?v:x)});
  const leadFac=facilitators.find(f=>f.id===mod.lead);
  const suppFac=facilitators.find(f=>f.id===mod.support);

  const Wrap=({value,onChange,multiline,style})=>editMode
    ?<Editable value={value} onChange={onChange} multiline={multiline} style={style}/>
    :<span style={style}>{value}</span>;

  return (
    <div style={{ background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ background:mod.color,padding:"20px 24px 16px" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10,color:"rgba(255,255,255,0.55)",fontWeight:700,letterSpacing:"0.1em",marginBottom:4 }}>{mod.month.toUpperCase()}</div>
            <div style={{ fontSize:20,fontWeight:700,color:"#fff",lineHeight:1.2,marginBottom:4 }}>
              <Wrap value={mod.title} onChange={v=>upd("title",v)} style={{color:"#fff",fontWeight:700,fontSize:20}}/>
            </div>
            <div style={{ fontSize:12,color:"rgba(255,255,255,0.75)",marginBottom:5 }}>
              <Wrap value={mod.theme} onChange={v=>upd("theme",v)} style={{color:"rgba(255,255,255,0.9)"}}/>
            </div>
            <div style={{ fontSize:11,color:"rgba(255,255,255,0.6)",fontStyle:"italic" }}>
              <Wrap value={mod.scripture} onChange={v=>upd("scripture",v)} style={{color:"rgba(255,255,255,0.75)",fontStyle:"italic"}}/>
            </div>
          </div>
          <div style={{ fontSize:36,fontWeight:800,color:"rgba(255,255,255,0.1)",lineHeight:1,marginLeft:16 }}>{String(mod.num).padStart(2,"0")}</div>
        </div>
        <div style={{ display:"flex",gap:8,marginTop:14,flexWrap:"wrap" }}>
          <Pill fac={leadFac} role="lead"/>
          <Pill fac={suppFac} role="support"/>
        </div>
      </div>

      <div style={{ padding:"18px 22px 22px" }}>
        {/* Topics */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7 }}>
            <span style={{ fontSize:10,fontWeight:700,color:T.navy,letterSpacing:"0.1em" }}>TOPICS & CONTENT</span>
            {editMode&&<button onClick={()=>onUpdate({...mod,topics:[...mod.topics,{main:"New Topic",subs:[""]}]})}
              style={{ fontSize:9,padding:"2px 7px",border:`1px solid ${T.borderMid}`,borderRadius:4,background:"none",cursor:"pointer",color:T.textMid,fontWeight:600 }}>+ Topic</button>}
          </div>
          {mod.topics.map((t,ti)=>(
            <div key={ti} style={{ marginBottom:5 }}>
              <button onClick={()=>setOpenTopic(openTopic===ti?null:ti)}
                style={{ width:"100%",textAlign:"left",background:openTopic===ti?T.navyLight:"transparent",
                  border:`1px solid ${openTopic===ti?T.navyMid:T.border}`,borderRadius:6,padding:"6px 10px",
                  cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,fontWeight:600,color:openTopic===ti?T.navy:T.textMid }}>
                  {editMode?<Editable value={t.main} onChange={v=>updTopic(ti,"main",v)} style={{fontSize:12,fontWeight:600,color:"inherit"}}/>:t.main}
                </span>
                <span style={{ fontSize:10,color:T.textSub,transform:openTopic===ti?"rotate(90deg)":"none",transition:"transform 0.15s" }}>{">"}</span>
              </button>
              {openTopic===ti&&(
                <div style={{ paddingLeft:12,paddingTop:3 }}>
                  {t.subs.map((s,si)=>(
                    <div key={si} style={{ display:"flex",alignItems:"center",gap:6,borderLeft:`2px solid ${mod.color}44`,paddingLeft:9,marginBottom:3 }}>
                      <span style={{ color:mod.color,fontSize:10,flexShrink:0 }}>--</span>
                      {editMode?<Editable value={s} onChange={v=>updSub(ti,si,v)} style={{fontSize:11,color:T.textMid,flex:1}}/>
                        :<span style={{ fontSize:11,color:T.textMid }}>{s}</span>}
                    </div>
                  ))}
                  {editMode&&<button onClick={()=>onUpdate({...mod,topics:mod.topics.map((t2,i2)=>i2===ti?{...t2,subs:[...t2.subs,""]}:t2)})}
                    style={{ background:"none",border:"none",cursor:"pointer",fontSize:10,color:T.navyMid,paddingLeft:14,marginTop:2 }}>+ sub-point</button>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Delivery */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7 }}>
            <span style={{ fontSize:10,fontWeight:700,color:T.navyMid,letterSpacing:"0.1em" }}>DELIVERY METHODS</span>
            {editMode&&<button onClick={()=>onUpdate({...mod,delivery:[...mod.delivery,""]})}
              style={{ fontSize:9,padding:"2px 7px",border:`1px solid ${T.borderMid}`,borderRadius:4,background:"none",cursor:"pointer",color:T.textMid,fontWeight:600 }}>+ Method</button>}
          </div>
          {mod.delivery.map((d,i)=>(
            <div key={i} style={{ display:"flex",gap:7,alignItems:"flex-start",marginBottom:3 }}>
              <span style={{ color:T.navyMid,fontSize:10,marginTop:3,flexShrink:0 }}>{">"}</span>
              {editMode?<Editable value={d} onChange={v=>updList("delivery",i,v)} style={{fontSize:11,color:T.textMid,flex:1}} multiline/>
                :<span style={{ fontSize:11,color:T.textMid }}>{d}</span>}
            </div>
          ))}
        </div>

        {/* Memorization */}
        <div style={{ background:T.goldLight,border:"1px solid #DFC98A",borderRadius:7,padding:"9px 12px",marginBottom:12 }}>
          <span style={{ fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"0.1em" }}>MEMORIZATION . </span>
          {editMode?<Editable value={mod.memorization} onChange={v=>upd("memorization",v)} style={{fontSize:11,color:T.textMid,fontStyle:"italic"}}/>
            :<span style={{ fontSize:11,color:T.textMid,fontStyle:"italic" }}>{mod.memorization}</span>}
        </div>

        {/* Assignments */}
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7 }}>
            <span style={{ fontSize:10,fontWeight:700,color:T.green,letterSpacing:"0.1em" }}>ASSIGNMENTS</span>
            {editMode&&<button onClick={()=>onUpdate({...mod,assignments:[...mod.assignments,""]})}
              style={{ fontSize:9,padding:"2px 7px",border:`1px solid ${T.borderMid}`,borderRadius:4,background:"none",cursor:"pointer",color:T.textMid,fontWeight:600 }}>+ Assignment</button>}
          </div>
          {mod.assignments.map((a,i)=>(
            <div key={i} style={{ display:"flex",gap:7,alignItems:"flex-start",marginBottom:3 }}>
              <span style={{ color:T.green,fontSize:11,flexShrink:0 }}>ok</span>
              {editMode?<Editable value={a} onChange={v=>updList("assignments",i,v)} style={{fontSize:11,color:T.textMid,flex:1}} multiline/>
                :<span style={{ fontSize:11,color:T.textMid }}>{a}</span>}
            </div>
          ))}
        </div>

        {/* LMS */}
        <div style={{ background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:7,padding:"9px 12px" }}>
          <span style={{ fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"0.1em" }}>VERITY LMS . </span>
          {editMode?<Editable value={mod.lms} onChange={v=>upd("lms",v)} style={{fontSize:11,color:T.textSub,fontStyle:"italic"}} multiline/>
            :<span style={{ fontSize:11,color:T.textSub,fontStyle:"italic" }}>{mod.lms}</span>}
        </div>
      </div>
    </div>
  );
}

// --- TIMELINE ---
function Timeline({ active, onSelect, modules, facilitators }) {
  return (
    <div style={{ display:"flex",borderBottom:`1px solid ${T.border}`,background:T.surface,overflowX:"auto",flexShrink:0 }}>
      {modules.map(m=>{
        const fac=facilitators.find(f=>f.id===m.lead);
        const isActive=active===m.num;
        return (
          <button key={m.num} onClick={()=>onSelect(isActive?null:m.num)}
            style={{ flex:"0 0 auto",minWidth:54,padding:"9px 6px 7px",cursor:"pointer",border:"none",
              background:isActive?m.color:"transparent",borderBottom:`3px solid ${isActive?T.gold:"transparent"}`,transition:"all 0.15s" }}>
            <div style={{ fontSize:8,fontWeight:700,color:isActive?"rgba(255,255,255,0.7)":T.textSub,letterSpacing:"0.04em" }}>
              {m.month.replace("Month ","")}
            </div>
            {fac
              ? <div style={{ margin:"3px auto",width:14,height:14,borderRadius:"50%",background:isActive?T.gold:fac.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",fontWeight:700,overflow:"hidden" }}>
                  {fac.avatarUrl?<img src={fac.avatarUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:fac.initials[0]}
                </div>
              : <div style={{ width:6,height:6,borderRadius:"50%",background:isActive?T.gold:T.borderMid,margin:"4px auto" }}/>}
            <div style={{ fontSize:8,color:isActive?"rgba(255,255,255,0.65)":T.borderMid,fontWeight:600 }}>M{m.num}</div>
          </button>
        );
      })}
    </div>
  );
}

// --- GRID OVERVIEW ---
function GridOverview({ modules, onSelect, onPreview, active, logs, facilitators }) {
  return (
    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10 }}>
      {modules.map(m=>{
        const count=logs.filter(l=>l.moduleNum===m.num).length;
        const pending=logs.filter(l=>l.moduleNum===m.num&&l.status==="pending").length;
        const leadFac=facilitators.find(f=>f.id===m.lead);
        const suppFac=facilitators.find(f=>f.id===m.support);
        const isActive = active === m.num;
        return (
          <div key={m.num}
            onClick={()=>onPreview(m.num)}
            style={{ background:T.surface,
              border:`1.5px solid ${isActive ? m.color : T.border}`,
              borderRadius:10, padding:"13px 15px", cursor:"pointer", textAlign:"left",
              boxShadow: isActive ? `0 0 0 3px ${m.color}22` : "0 1px 4px rgba(0,0,0,0.05)",
              position:"relative", overflow:"hidden",
              transition:"border-color 0.15s, box-shadow 0.15s" }}>
            <div style={{ position:"absolute",top:0,left:0,width:4,bottom:0,background:m.color,borderRadius:"10px 0 0 10px" }}/>
            <div style={{ paddingLeft:9 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6 }}>
                <span style={{ fontSize:9,color:T.gold,fontWeight:700,letterSpacing:"0.1em" }}>{m.month.toUpperCase()}</span>
                <div style={{ display:"flex",gap:4,alignItems:"center",flexWrap:"wrap" }}>
                  {pending>0&&<span style={{ fontSize:9,background:T.amberLight,color:T.amber,borderRadius:20,padding:"1px 6px",fontWeight:700 }}>{pending} pending</span>}
                  {count>0&&!pending&&<span style={{ fontSize:9,background:T.navyLight,color:T.navy,borderRadius:20,padding:"1px 6px",fontWeight:600 }}>{count} notes</span>}
                  {leadFac&&<Avatar fac={leadFac} size={18}/>}
                  {suppFac&&<Avatar fac={suppFac} size={18}/>}
                </div>
              </div>
              <div style={{ fontSize:13,fontWeight:700,color:T.text,lineHeight:1.2,marginBottom:2 }}>{m.title}</div>
              <div style={{ fontSize:11,color:T.textSub }}>{m.theme}</div>
              <div style={{ marginTop:7,fontSize:10,color:T.borderMid,fontStyle:"italic" }}>{m.scripture.split("|")[0].trim()}</div>
              <button
                onClick={e=>{e.stopPropagation();onSelect(m.num);}}
                style={{ marginTop:10,fontSize:10,fontWeight:600,color:m.color,background:"none",
                  border:`1px solid ${m.color}55`,borderRadius:5,padding:"3px 10px",cursor:"pointer" }}>
                Open module
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- ROTATION VIEW ---
function RotationView({ modules, logs, onAdd, onStatus, facilitators, isAdmin }) {
  return (
    <div style={{ flex:1,minWidth:0 }}>
        {/* Facilitator cards */}
        <div style={{ display:"flex",gap:10,marginBottom:18,flexWrap:"wrap" }}>
          {facilitators.map(f=>{
            const leads=modules.filter(m=>m.lead===f.id);
            const supports=modules.filter(m=>m.support===f.id);
            return (
              <div key={f.id} style={{ background:T.surface,border:`1px solid ${T.border}`,borderTop:`3px solid ${f.color}`,borderRadius:10,padding:"14px 16px",flex:"1 1 180px" }}>
                <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
                  <Avatar fac={f} size={36}/>
                  <div>
                    <div style={{ fontSize:13,fontWeight:700,color:T.text }}>{f.name}</div>
                    {f.role&&<div style={{ fontSize:10,color:T.textSub }}>{f.role}</div>}
                  </div>
                </div>
                <div style={{ marginBottom:5 }}>
                  <div style={{ fontSize:9,color:f.color,fontWeight:700,letterSpacing:"0.1em",marginBottom:2 }}>LEAD ({leads.length})</div>
                  <div style={{ fontSize:10,color:T.textMid }}>{leads.map(m=>m.month.replace("Month ","M")).join(" . ")||"--"}</div>
                </div>
                <div>
                  <div style={{ fontSize:9,color:T.textSub,fontWeight:700,letterSpacing:"0.1em",marginBottom:2 }}>SUPPORT ({supports.length})</div>
                  <div style={{ fontSize:10,color:T.textSub }}>{supports.map(m=>m.month.replace("Month ","M")).join(" . ")||"--"}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rotation grid */}
        <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden" }}>
          <div style={{ padding:"12px 18px",borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:12,fontWeight:700,color:T.navy }}>MONTHLY ROTATION GRID</div>
            <div style={{ fontSize:10,color:T.textSub,marginTop:2 }}>{"Lead ( filled ) / Support ( ring )"}</div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:T.surfaceAlt }}>
                  <th style={{ padding:"7px 14px",textAlign:"left",fontSize:10,color:T.textSub,fontWeight:700,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap" }}>MODULE</th>
                  <th style={{ padding:"7px 10px",textAlign:"left",fontSize:10,color:T.textSub,fontWeight:700,borderBottom:`1px solid ${T.border}` }}>TITLE</th>
                  {facilitators.map(f=>(
                    <th key={f.id} style={{ padding:"7px 16px",textAlign:"center",fontSize:10,borderBottom:`1px solid ${T.border}` }}>
                      <Avatar fac={f} size={22}/>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m,i)=>(
                  <tr key={m.num} style={{ background:i%2===0?T.surface:T.bg }}>
                    <td style={{ padding:"7px 14px",fontSize:11,color:T.gold,fontWeight:700,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap" }}>{m.month}</td>
                    <td style={{ padding:"7px 10px",fontSize:11,color:T.textMid,borderBottom:`1px solid ${T.border}`,maxWidth:180,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{m.title}</td>
                    {facilitators.map(f=>{
                      const isLead=m.lead===f.id,isSupport=m.support===f.id;
                      return <td key={f.id} style={{ padding:"7px 16px",textAlign:"center",borderBottom:`1px solid ${T.border}` }}>
                        {isLead&&<span style={{ width:12,height:12,borderRadius:"50%",background:f.color,display:"inline-block" }}/>}
                        {isSupport&&<span style={{ width:8,height:8,borderRadius:"50%",border:`2px solid ${T.borderMid}`,display:"inline-block" }}/>}
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

    </div>
  );
}

// --- ROOT ---
export default function App() {
  const [modules, setModules]       = useState(DEFAULT_MODULES);
  const [facilitators, setFac]      = useState(DEFAULT_FACILITATORS);
  const [logs, setLogs]             = useState([]);
  const [view, setView]             = useState("overview");
  const [active, setActive]         = useState(null);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [showPin, setShowPin]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [sessionUser, setSessionUser] = useState(null); // auto-detected from Supabase auth

  const selectedMod = active ? modules.find(m=>m.num===active) : null;
  const pendingCount = logs.filter(l=>l.status==="pending").length;

  // Load data and detect user identity on mount
  useEffect(()=>{

    // --- Priority 1: VLC iframe URL params ---
    // When opened from the VLC app, user info arrives as query params.
    // These take precedence over everything else.
    const params = new URLSearchParams(window.location.search);
    const vlcName     = params.get("vlc_user");
    const vlcInitials = params.get("vlc_initials");
    const vlcEmail    = params.get("vlc_email");
    const vlcRole     = params.get("vlc_role");
    const vlcId       = params.get("vlc_id");
    const vlcAvatar   = params.get("vlc_avatar");

    if (vlcName) {
      console.log("[DCW] User injected from VLC iframe params:", vlcName);
      const vlcProfile = {
        id:        vlcId    || null,
        full_name: vlcName,
        initials:  vlcInitials || vlcName.split(" ").map(w=>w[0]).join("").toUpperCase(),
        email:     vlcEmail || null,
        role:      vlcRole  || "instructor",
        avatar_url: vlcAvatar || null,
        // Build a matching facilitator entry so avatar/initials render in the composer
        color:     vlcRole === "admin" ? T.navy : T.green,
        light:     vlcRole === "admin" ? T.navyLight : T.greenLight,
        avatarUrl: vlcAvatar || null,
      };
      setSessionUser(vlcProfile);
      if (vlcRole === "admin") setIsAdmin(true);
      // Also inject this person into the facilitator list if they aren't already there
      setFac(prev => {
        const alreadyIn = prev.some(f => f.id === vlcId || f.name === vlcName);
        if (alreadyIn) return prev;
        return [...prev, { ...vlcProfile, id: vlcId || vlcName }];
      });
    }

    // --- Priority 2 & 3: Supabase (session or data) ---
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      if (!vlcName) {
        console.warn("[DCW] Supabase not configured and no VLC params -- anonymous mode.");
      }
      return;
    }

    sbFetch("curriculum_facilitators?select=*&order=sort_order.asc").then(rows=>{
      if (rows?.length) {
        console.log("[DCW] Loaded", rows.length, "facilitators from Supabase");
        setFac(prev => {
          // Merge: keep any VLC-injected user, replace the rest with Supabase data
          const vlcEntry = prev.find(f => f.id === vlcId || f.name === vlcName);
          const sbEntries = rows.map(r=>({
            id:r.id, name:r.name,
            initials: r.initials || r.name.split(" ").map(w=>w[0]).join("").toUpperCase(),
            color:r.color||T.navy, light:r.light||T.navyLight,
            avatarUrl:r.avatar_url||null, role:r.role||null,
          }));
          // If VLC user is already in Supabase data, no need to keep the injected one
          const vlcInSb = vlcEntry && sbEntries.some(f => f.id === vlcEntry.id);
          return vlcEntry && !vlcInSb ? [vlcEntry, ...sbEntries] : sbEntries;
        });
      } else {
        console.warn("[DCW] curriculum_facilitators returned no rows -- check RLS and profile roles");
      }
    });

    sbFetch("curriculum_edits?select=*&order=created_at.asc").then(rows=>{
      if (rows?.length) setLogs(rows);
    });

    // Priority 2: Supabase session (standalone, not iframe)
    if (!vlcName) {
      getSessionProfile().then(profile => {
        if (profile) {
          console.log("[DCW] Authenticated via Supabase session:", profile.full_name);
          setSessionUser(profile);
          if (profile.role === "admin") setIsAdmin(true);
        } else {
          console.log("[DCW] No session and no VLC params -- anonymous/test mode");
        }
      });
    }

  },[]);

  const updateModule = useCallback(updated => {
    setModules(prev=>prev.map(m=>m.num===updated.num?updated:m));
    setSaved(false);
  },[]);

  const addLog = useCallback(async (entry) => {
    // Auto-populate author from session if available
    const resolvedEntry = {
      ...entry,
      author: entry.author || (sessionUser?.full_name) || "Anonymous",
      fac_id: entry.fac_id || sessionUser?.id || null,
    };
    setLogs(prev=>[...prev,resolvedEntry]);
    const mod = DEFAULT_MODULES.find(m=>m.num===entry.moduleNum);
    const modName = mod ? mod.month+" -- "+mod.title : "General";
    if (SUPABASE_URL && SUPABASE_ANON) await sbFetch("curriculum_edits",{method:"POST",body:JSON.stringify(resolvedEntry)});
    if (resolvedEntry.type==="edit") await sendAdminEmail(resolvedEntry, modName);
    await syncToNotion(resolvedEntry, modName);
  },[sessionUser]);

  const updateStatus = useCallback((id,status)=>{
    setLogs(prev=>prev.map(l=>l.id===id?{...l,status}:l));
    if (SUPABASE_URL) sbFetch(`curriculum_edits?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({status})});
  },[]);

  const handleSave = () => {
    try { localStorage.setItem("vlc_curriculum_v4",JSON.stringify(modules)); setSaved(true); setTimeout(()=>setSaved(false),2500); }
    catch { alert("localStorage unavailable in this preview. Works in deployed build."); }
  };

  const handleSelect = num => {
    setActive(num);
    if (num) setView("detail");
  };

  const handlePreview = num => {
    // Just activates feedback panel context without leaving overview
    setActive(prev => prev === num ? null : num);
  };

  const tabs = [
    { id:"overview", label:"Modules" },
    { id:"rotation", label:"Rotation" },
    { id:"all-feedback", label:`All Feedback${pendingCount>0?` (${pendingCount})`:""}`},
  ];

  return (
    <div style={{ height:"100vh",display:"flex",flexDirection:"column",background:T.bg,color:T.text,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        button,input,textarea,select{font-family:inherit;}
        input,textarea{resize:vertical;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${T.bg};}
        ::-webkit-scrollbar-thumb{background:${T.borderMid};border-radius:3px;}
      `}</style>

      {showWelcome && <WelcomeModal onClose={()=>setShowWelcome(false)}/>}
      {showPin && <AdminPinModal onSuccess={()=>{setIsAdmin(true);setShowPin(false);}} onCancel={()=>setShowPin(false)}/>}

      {/* TOP BAR */}
      <div style={{ background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"11px 22px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        zIndex:100,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",flexWrap:"wrap",gap:8,flexShrink:0 }}>
        <div>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:1 }}><div style={{ width:28,height:28,borderRadius:6,background:T.navy,border:`1.5px solid ${T.gold}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:T.gold,letterSpacing:"0.05em",flexShrink:0 }}>DCW</div><div style={{ fontSize:10,color:T.gold,fontWeight:700,letterSpacing:"0.12em" }}>VERITY LEARNING CENTER</div></div>
          <div style={{ fontSize:16,fontWeight:800,color:T.navy }}>Discipleship Curriculum Workspace</div>
          <div style={{ fontSize:10,color:T.textSub }}>12-Month Curriculum . Monday Sessions . Matthew 28:18-20</div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:7,flexWrap:"wrap" }}>
          {/* Admin controls */}
          {!isAdmin
            ? <button onClick={()=>setShowPin(true)}
                style={{ padding:"5px 13px",borderRadius:7,border:`1px solid ${T.borderMid}`,background:"transparent",color:T.textSub,fontSize:11,fontWeight:600,cursor:"pointer" }}>
                Admin
              </button>
            : <>
                <span style={{ fontSize:10,background:T.greenLight,color:T.green,border:`1px solid #9BCCB0`,borderRadius:20,padding:"2px 9px",fontWeight:700 }}> Admin</span>
                <button onClick={()=>setIsAdmin(false)}
                  style={{ fontSize:10,padding:"3px 9px",border:`1px solid ${T.borderMid}`,borderRadius:6,background:"none",cursor:"pointer",color:T.textSub }}>Sign out</button>
                <button onClick={handleSave}
                  style={{ padding:"5px 13px",borderRadius:7,border:"none",background:saved?T.green:T.navy,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer" }}>
                  {saved?"Saved":"Save Edits"}
                </button>
              </>}
          {/* Nav tabs */}
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>{setView(t.id);if(t.id!=="detail")setActive(null);}}
              style={{ padding:"5px 13px",borderRadius:7,cursor:"pointer",
                background:view===t.id?T.navy:"transparent",color:view===t.id?"#fff":T.textSub,
                border:`1px solid ${view===t.id?T.navy:T.border}`,fontSize:11,fontWeight:600,transition:"all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Timeline active={active} onSelect={handleSelect} modules={modules} facilitators={facilitators}/>

      {/* MAIN BODY */}
      <div style={{ display:"flex",flex:1,minHeight:0,overflow:"hidden" }}>
        <div style={{ flex:1,overflowY:"auto",overflowX:"hidden",padding:"22px 22px 48px",minWidth:0,height:"100%" }}>

          {/* OVERVIEW */}
          {(view==="overview"||view==="detail")&&!selectedMod&&(
            <>
              <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap" }}>
                {[{label:"Modules",v:"12"},{label:"Sessions/month",v:"4-5 Mon"},{label:"Facilitators",v:String(facilitators.length)},{label:"Pending feedback",v:String(pendingCount)}].map(s=>(
                  <div key={s.label} style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 16px",flex:"1 1 120px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize:20,fontWeight:800,color:T.navy }}>{s.v}</div>
                    <div style={{ fontSize:9,color:T.textSub,letterSpacing:"0.08em",marginTop:2 }}>{s.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              {isAdmin&&<div style={{ fontSize:11,color:T.gold,marginBottom:12,fontWeight:600 }}>(edit) Admin mode -- click any field to edit directly.</div>}
              <GridOverview modules={modules} onSelect={handleSelect} onPreview={handlePreview} active={active} logs={logs} facilitators={facilitators}/>
            </>
          )}

          {/* DETAIL */}
          {selectedMod&&(
            <div style={{ display:"flex",gap:16,alignItems:"flex-start" }}>
              <div style={{ flex:1,minWidth:0 }}>
                <button onClick={()=>{setActive(null);setView("overview");}}
                  style={{ background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.textMid,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:600,marginBottom:14 }}>
                  Back to Modules
                </button>
                <ModuleCard mod={selectedMod} onUpdate={updateModule} editMode={isAdmin} facilitators={facilitators}/>
              </div>
              {/* Jump nav */}
              <div style={{ width:150,flexShrink:0 }}>
                <div style={{ fontSize:10,fontWeight:700,color:T.textSub,letterSpacing:"0.08em",marginBottom:7 }}>JUMP TO</div>
                {modules.map(m=>{
                  const hasPending=logs.some(l=>l.moduleNum===m.num&&l.status==="pending");
                  return (
                    <button key={m.num} onClick={()=>setActive(m.num)}
                      style={{ width:"100%",padding:"6px 9px",marginBottom:3,background:active===m.num?m.color:T.surface,
                        border:`1px solid ${active===m.num?m.color:T.border}`,borderRadius:6,cursor:"pointer",textAlign:"left",
                        display:"flex",alignItems:"center",gap:7 }}>
                      <span style={{ fontSize:9,color:active===m.num?"rgba(255,255,255,0.65)":T.gold,fontWeight:700,minWidth:16 }}>{String(m.num).padStart(2,"0")}</span>
                      <span style={{ fontSize:10,color:active===m.num?"#fff":T.textMid,flex:1 }}>{m.month}</span>
                      {hasPending&&<span style={{ width:6,height:6,borderRadius:"50%",background:T.amber,flexShrink:0 }}/>}
                    </button>
                  );
                })}
              </div>
              {nameError && (
                <span style={{ fontSize:9,color:T.red,fontWeight:600 }}>
                  Please enter your name before posting.
                </span>
              )}
            </div>
          )}

          {view==="rotation"&&<RotationView modules={modules} logs={logs} onAdd={addLog} onStatus={updateStatus} facilitators={facilitators} isAdmin={isAdmin} sessionUser={sessionUser}/>}

          {view==="all-feedback"&&(
            <div style={{ maxWidth:700 }}>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:16,fontWeight:700,color:T.navy,marginBottom:3 }}>All Feedback & Edit Requests</div>
                <div style={{ fontSize:12,color:T.textSub }}>Every submission across all modules. {isAdmin?"Approve or reject edit requests here.":"Visible to all facilitators."}</div>
              </div>
              <FeedbackPanel moduleNum={null} moduleName={null} logs={logs} onAdd={addLog} onStatus={updateStatus} facilitators={facilitators} isAdmin={isAdmin} sessionUser={sessionUser}/>
              {nameError && (
                <span style={{ fontSize:9,color:T.red,fontWeight:600 }}>
                  Please enter your name before posting.
                </span>
              )}
            </div>
          )}
        </div>

        {/* PERSISTENT FEEDBACK PANEL -- always visible, scoped to active module or global */}
        {(view==="overview"||view==="detail"||view==="rotation") && (
          <div style={{
            width:300, flexShrink:0,
            borderLeft:`1px solid ${T.border}`,
            display:"flex", flexDirection:"column",
            height:"100%", overflow:"hidden",
            background:T.surface, minHeight:0,
          }}>
            <FeedbackPanel
              moduleNum={selectedMod ? active : null}
              moduleName={
                view==="rotation" ? "Rotation Schedule" :
                selectedMod ? selectedMod.month+" -- "+selectedMod.title : null
              }
              logs={logs}
              onAdd={addLog}
              onStatus={updateStatus}
              facilitators={facilitators}
              isAdmin={isAdmin}
              compact={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
