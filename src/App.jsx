import { useState, useEffect, useCallback, useRef, createElement as h } from 'react'
import './App.css'

const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null
const ps = (t) => { if (!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume(); const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); const x = audioCtx.currentTime; if (t === 'ok') { o.frequency.value = 523; g.gain.setValueAtTime(0.15, x); o.start(x); o.frequency.setValueAtTime(659, x+0.1); g.gain.exponentialRampToValueAtTime(0.01, x+0.3); o.stop(x+0.3) } else if (t === 'err') { o.frequency.value = 200; o.type='sawtooth'; g.gain.setValueAtTime(0.1, x); g.gain.exponentialRampToValueAtTime(0.01, x+0.2); o.start(x); o.stop(x+0.2) } else { o.frequency.value = 800; g.gain.setValueAtTime(0.05, x); g.gain.exponentialRampToValueAtTime(0.01, x+0.1); o.start(x); o.stop(x+0.1) } }

const hashPwd = async (pwd) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd + 'bh_salt_2024'))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

const JS_KW = new Set(['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','this','class','extends','super','import','from','export','default','try','catch','finally','throw','async','await','yield','typeof','instanceof','in','of','true','false','null','undefined','void','delete','static','get','set','enum','implements','interface','package','private','protected','public'])
const PY_KW = new Set(['def','return','if','elif','else','for','while','break','continue','pass','import','from','as','class','try','except','finally','raise','with','yield','lambda','and','or','not','is','in','True','False','None','global','nonlocal','assert','del','print'])
const TS_KW = new Set([...JS_KW, 'type','interface','enum','namespace','declare','readonly','abstract','implements','keyof','typeof','infer','extends','as','is','never','any','unknown','number','string','boolean','void','undefined','null','unique','symbol','bigint','module','require','readonly','override','satisfies','out','in','const','let'])

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

const hl = (code, lang) => {
  if (!code) return [h('span', {key:0, className:'syn'}, ' ')]
  const el = []
  let i = 0
  const add = (cls, text) => { if (text) el.push(h('span', {key:el.length, className:'syn syn-'+cls}, esc(text))) }
  const isRx = lang === 'RX'
  const isPy = lang === 'PY'
  const kw = isPy ? PY_KW : (lang === 'TS' ? TS_KW : JS_KW)
  const isJsLike = !isRx

  while (i < code.length) {
    // Python comments
    if (isPy && code[i] === '#') { add('cmt', code.slice(i)); break }
    // JS/TS comments
    if (isJsLike && code[i]==='/' && code[i+1]==='/') { add('cmt', code.slice(i)); break }
    // Strings
    if (isJsLike && (code[i]==='"' || code[i]==="'" || code[i]==='`')) {
      const q = code[i]; let j = i+1
      while (j < code.length && code[j] !== q) { if (code[j]==='\\') j++; j++ }
      if (j < code.length) j++
      add('str', code.slice(i,j)); i = j; continue
    }
    // Regex patterns (standalone language)
    if (isRx) {
      // Character classes
      if (code[i]==='\\' && i+1<code.length) {
        const next = code[i+1]
        if ('dDwWsStnbBr'.includes(next)) { add('rx-class', code.slice(i,i+2)); i+=2; continue }
        add('esc', code.slice(i,i+2)); i+=2; continue
      }
      if (code[i]==='[') { let j=i+1; if(j<code.length&&code[j]==='^')j++; while(j<code.length&&code[j]!==']'){if(code[j]==='\\')j++;j++} if(j<code.length)j++; add('rx-group',code.slice(i,j)); i=j; continue }
      if ('*+?'.includes(code[i])) { add('rx-quant', code[i]); i++; continue }
      if (code[i]==='{') { let j=i+1; while(j<code.length&&code[j]!=='}')j++; if(j<code.length)j++; add('rx-quant',code.slice(i,j)); i=j; continue }
      if (code[i]==='^' || code[i]==='$') { add('rx-anchor', code[i]); i++; continue }
      if (code[i]==='(' || code[i]===')') { add('rx-paren', code[i]); i++; continue }
      if (code[i]==='|') { add('rx-alt', code[i]); i++; continue }
      if (code[i]==='.') { add('rx-dot', code[i]); i++; continue }
    }
    // Numbers
    if (/[0-9]/.test(code[i]) && (i===0 || !/[a-zA-Z_$]/.test(code[i-1]))) {
      let j=i; while(j<code.length && /[0-9.]/.test(code[j])) j++
      add('num', code.slice(i,j)); i=j; continue
    }
    // Words (identifiers/keywords)
    if (/[a-zA-Z_$@]/.test(code[i])) {
      let j=i; while(j<code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++
      const word = code.slice(i,j)
      // Python decorators
      if (isPy && code[i]==='@') { add('dec', word); i=j; continue }
      // Function calls (word followed by '(')
      let k=j; while(k<code.length && code[k]===' ') k++
      if (kw.has(word)) { add('kw', word) }
      else if (code[k]==='(') { add('fn', word) }
      else if (word==='console' || word==='document' || word==='window' || word==='Math' || word==='JSON' || word==='Array' || word==='Object' || word==='Promise' || word==='Proxy' || word==='WeakRef' || word==='Error' || word==='TypeError' || word==='RangeError' || word==='Set' || word==='Map' || word==='RegExp') { add('gl', word) }
      else { add('id', word) }
      i=j; continue
    }
    // JSX tags
    if (isJsLike && code[i]==='<') {
      let j=i+1; if(code[j]==='/')j++; while(j<code.length && /[a-zA-Z0-9_.]/.test(code[j]))j++
      if (j>i+1 && code[j-1]!=='<') { add('jsx', code.slice(i,j)); i=j; continue }
    }
    // Operators
    if ('=+-*/%!<>&|^~'.includes(code[i])) {
      let j=i+1
      if (j<code.length && '=><'.includes(code[j])) j++
      if (j<code.length && code[j]==='=') j++
      add('op', code.slice(i,j)); i=j; continue
    }
    // Punctuation
    if ('()[]{}.,;:'.includes(code[i])) { add('pn', code[i]); i++; continue }
    // Whitespace
    if (code[i]===' ' || code[i]==='\t') {
      let j=i; while(j<code.length && (code[j]===' ' || code[j]==='\t')) j++
      add('ws', code.slice(i,j)); i=j; continue
    }
    // Fallback
    add('pn', code[i]); i++
  }
  return el.length ? el : [h('span', {key:0, className:'syn'}, ' ')]
}

const Q = {
  easy: [
    { l:'JS', t:'Fix Loop', c:['for (let i = 0; i <= 5; i--) {','  console.log(i);','}'], b:0, h:'Check increment', e:'Use i++ not i--', exp:'The for loop syntax is: for(init; condition; update). Here i-- decrements instead of incrementing, causing infinite loop. Fix: change i-- to i++', cat:'loops', p:10, s:30 },
    { l:'JS', t:'Array', c:['const arr = [1, 2, 3];','console.log(arr[3]);'], b:1, h:'Zero-indexed', e:'arr[3] out of bounds', exp:'Arrays are zero-indexed: arr[0]=1, arr[1]=2, arr[2]=3. arr[3] is undefined. To get last element use arr[arr.length-1] or arr[2]', cat:'arrays', p:10, s:25 },
    { l:'PY', t:'Indent', c:['def greet(name):','print("Hi")'], b:1, h:'Indentation', e:'Print needs indent', exp:'Python uses indentation to define code blocks. All code inside a function must be indented (usually 4 spaces). Fix: add 4 spaces before print()', cat:'syntax', p:10, s:30 },
    { l:'JS', t:'Variable', c:['function test() {','  x = 5;','  return x;','}'], b:1, h:'Declare', e:'Use let/const', exp:'Variables must be declared with let, const, or var. Undeclared variables become global (bad practice). Fix: change x to let x', cat:'variables', p:10, s:25 },
    { l:'PY', t:'Colon', c:['if x > 5','  print("big")'], b:0, h:'Need :', e:'if needs colon', exp:'Python if/else/for/while/def/class statements must end with a colon (:). It tells Python a code block follows. Fix: add : after the condition', cat:'syntax', p:10, s:25 },
    { l:'JS', t:'Strings', c:['const a = "5";','const b = "3";','console.log(a + b);'], b:2, h:'Type', e:'Gives "53"', exp:'When using + with strings, JavaScript concatenates them. "5" + "3" = "53". To add numbers, convert first: Number(a) + Number(b) or parseInt()', cat:'types', p:10, s:30 },
    { l:'PY', t:'Case', c:['name = "Alice"','Print(name)'], b:1, h:'Lowercase', e:'Use print()', exp:'Python is case-sensitive. Print() is not a built-in function, only print() is. Always use lowercase for Python built-in functions', cat:'syntax', p:10, s:20 },
    { l:'JS', t:'Return', c:['const x = 5','const y = 3','return x + y'], b:2, h:'In fn?', e:'return needs fn', exp:'The return statement can only be used inside a function. This code is at the top level. Fix: wrap in a function like: function add() { return x + y }', cat:'functions', p:10, s:25 },
    { l:'PY', t:'Comment', c:['// comment','print("hi")'], b:0, h:'Python', e:'Use # not //', exp:'Python uses # for single-line comments, not // (which is JavaScript syntax). Multi-line comments use triple quotes """', cat:'syntax', p:10, s:20 },
    { l:'JS', t:'Const', c:['const x = 5;','x = 10;'], b:1, h:'Immutable', e:'const cant change', exp:'const creates a constant that cannot be reassigned. If you need to change the value, use let instead. const is for values that should never change', cat:'variables', p:10, s:25 },
    { l:'JS', t:'Semicolon', c:['const x = 5','const y = 3','console.log(x + y)'], b:0, h:'Missing ;', e:'Need semicolon', exp:'JavaScript statements should end with a semicolon. Without it, automatic semicolon insertion may cause unexpected behavior. Always end statements with ;', cat:'syntax', p:10, s:25 },
    { l:'PY', t:'Range', c:['for i in range(5):','  print(i)'], b:0, h:'Correct?', e:'No bug here', exp:'This code is actually correct! range(5) generates 0,1,2,3,4. The loop prints each number. Good code can sometimes look suspicious!', cat:'loops', p:10, s:30 },
    { l:'JS', t:'Bool', c:['if (x = 5) {','  console.log("five");','}'], b:0, h:'Compare?', e:'= not ==', exp:'Single = is assignment, not comparison. if (x = 5) assigns 5 to x and evaluates to truthy. Use == or === for comparison: if (x === 5)', cat:'operators', p:10, s:30 },
    { l:'PY', t:'List Add', c:['nums = [1, 2, 3]','nums = nums.append(4)','print(nums)'], b:1, h:'Return', e:'append returns None', exp:'list.append() modifies the list in place and returns None. nums = nums.append(4) sets nums to None. Fix: just use nums.append(4) without assignment', cat:'lists', p:10, s:30 },
    { l:'JS', t:'Parse', c:['const n = parseInt("10px");','console.log(n);'], b:0, h:'Partial?', e:'Returns 10', exp:'parseInt() parses until it hits a non-number. parseInt("10px") returns 10. This may or may not be a bug depending on intent. Be careful with partial parsing!', cat:'types', p:10, s:25 },
    { l:'PY', t:'Print', c:['print("Hello" + 5)'], b:0, h:'Type', e:'Cant add str+int', exp:'Python does not auto-convert types. Cannot concatenate string and int. Fix: print("Hello" + str(5)) or print(f"Hello{5}")', cat:'types', p:10, s:25 },
    { l:'JS', t:'Arrow', c:['const add = (a, b) => {','  a + b','}'], b:1, h:'Return', e:'Missing return', exp:'Arrow functions with curly braces need explicit return. Without it, function returns undefined. Fix: return a + b or use parentheses: (a, b) => a + b', cat:'functions', p:10, s:30 },
    { l:'PY', t:'Dict Get', c:['d = {"a": 1}','print(d["b"])'], b:1, h:'Key exists?', e:'KeyError', exp:'Accessing a non-existent dictionary key raises KeyError. Use d.get("b") which returns None, or d.get("b", default) for a default value', cat:'dictionaries', p:10, s:25 },
    { l:'JS', t:'Div Zero', c:['const x = 10 / 0;','console.log(x);'], b:0, h:'Error?', e:'Returns Infinity', exp:'JavaScript does not throw error on division by zero. 10 / 0 returns Infinity. Use isFinite() to check. Some languages throw exceptions, but not JS!', cat:'types', p:10, s:25 },
    { l:'PY', t:'Open File', c:['f = open("data.txt")','content = f.read()'], b:0, h:'Always safe?', e:'File may not exist', exp:'open() raises FileNotFoundError if file does not exist. Always handle potential errors with try/except or check os.path.exists() first', cat:'files', p:10, s:30 },
    { l:'JS', t:'NaN', c:['const x = NaN;','if (x === NaN) {','  console.log("is NaN");','}'], b:1, h:'Special', e:'NaN !== NaN', exp:'NaN is not equal to anything, including itself! Use Number.isNaN(x) or isNaN() to check. x === NaN will always be false', cat:'types', p:10, s:30 },
    { l:'TS', t:'Type', c:['let x: number = 5;','x = "hello";'], b:1, h:'Type', e:'Type mismatch', exp:'TypeScript enforces types at compile time. x is declared as number, assigning a string causes TS error. Fix: change type to string or number union', cat:'types', p:10, s:30 },
    { l:'TS', t:'Optional', c:['function greet(name?: string) {','  return "Hi " + name;','}'], b:1, h:'Undefined', e:'name may be undefined', exp:'Optional params can be undefined. "Hi " + undefined gives "Hi undefined". Fix: provide default: name: string = "Guest" or check if name exists', cat:'functions', p:10, s:30 },
    { l:'RX', t:'Match', c:['const re = /[0-9]/;','console.log(re.test("abc"));'], b:1, h:'Any?', e:'No digit found', exp:'/[0-9]/ matches any single digit. "abc" has no digits so test() returns false. Use /[a-z]/ to match lowercase letters', cat:'regex', p:10, s:25 },
    { l:'RX', t:'Escape', c:['const re = /d+.d+/;','console.log(re.test("3.14"));'], b:0, h:'Special?', e:'Use \\. not .', exp:'In regex, . matches ANY character. d+ matches "d" one or more times. Use \\d+\\.\\d+ to match decimal numbers. Escape special chars with \\', cat:'regex', p:10, s:30 },
    { l:'RE', t:'State', c:['const [count, setCount] = useState();','console.log(count);'], b:0, h:'Initial?', e:'count is undefined', exp:'useState() without argument sets initial value to undefined. Pass a default: useState(0). Always provide an initial value for state', cat:'hooks', p:10, s:30 },
    { l:'RE', t:'Effect', c:['useEffect(() => {','  fetchData();','})'], b:0, h:'Deps?', e:'Runs every render', exp:'useEffect without dependency array runs after EVERY render. This causes infinite loops with state updates. Add [] for mount-only or [dep] for specific deps', cat:'hooks', p:10, s:30 },
    { l:'TS', t:'Union', c:['type ID = string | number;','const id: ID = true;'], b:2, h:'Union', e:'true not in union', exp:'Union type string | number only allows strings or numbers. boolean (true) is not compatible. Fix: add boolean to union or use a different value', cat:'types', p:10, s:25 },
    { l:'RX', t:'Anchors', c:['const re = /^hello/;','console.log(re.test("say hello"));'], b:1, h:'Start?', e:'Must start with', exp:'^ matches START of string. "say hello" starts with "s" not "h". Remove ^ to match anywhere: /hello/ or use /hello$/ for end', cat:'regex', p:10, s:25 },
    { l:'RE', t:'Key', c:['const items = ["a","b","c"];','items.map(i => <li>{i}</li>)'], b:1, h:'Key?', e:'Missing key prop', exp:'React needs unique key prop on list items for efficient updates. Fix: items.map(i => <li key={i}>{i}</li>). Without keys, React warns and renders inefficiently', cat:'jsx', p:10, s:30 },
  ],
  medium: [
    { l:'JS', t:'Compare', c:['const x = "5";','if (x === 5) {','  console.log("Eq");','}'], b:1, h:'Types', e:'"5" !== 5', exp:'=== checks both value AND type. "5" is a string, 5 is a number. They are different types. Use == for loose comparison or convert: Number(x) === 5', cat:'types', p:20, s:35 },
    { l:'PY', t:'List', c:['nums = [1,2,3]','for n in nums:','  if n == 2:','    nums.remove(n)'], b:1, h:'Dont modify', e:'Use comp', exp:'Modifying a list while iterating causes items to be skipped. Use list comprehension: [n for n in nums if n != 2] or iterate over a copy', cat:'lists', p:20, s:40 },
    { l:'JS', t:'Async', c:['function fetch() {','  const d = await f();','  return d;','}'], b:0, h:'async', e:'Add async', exp:'await can only be used inside an async function. The function must be declared as: async function fetch() { ... }. This tells JS it contains asynchronous code', cat:'async', p:20, s:35 },
    { l:'PY', t:'Dict', c:['user = {"name":"John"}','print(user["email"])'], b:1, h:'Key?', e:'Use .get()', exp:'Accessing a non-existent key raises KeyError. Use .get("email") which returns None if key missing, or .get("email", "default") for a default value', cat:'dictionaries', p:20, s:30 },
    { l:'JS', t:'This', c:['const obj = {','  name:"Bug",','  g: () => this.name','};'], b:2, h:'Arrow', e:'Arrow no this', exp:'Arrow functions do not have their own this binding. They inherit this from the enclosing scope. Use regular function: g() { return this.name }', cat:'functions', p:20, s:40 },
    { l:'PY', t:'Global', c:['x = 10','def c():','  x = 20','c()','print(x)'], b:2, h:'Scope', e:'Use global', exp:'Inside a function, x = 20 creates a LOCAL variable. To modify the outer x, declare global x first: def c(): global x; x = 20', cat:'scope', p:20, s:35 },
    { l:'JS', t:'Listener', c:['function a() {','  btn.on("click", h);','}','a();','a();'], b:1, h:'Dup', e:'Remove first', exp:'Each call to a() adds another click listener. Multiple listeners stack up. Remove old one first with removeEventListener() before adding new', cat:'events', p:20, s:35 },
    { l:'PY', t:'File', c:['f = open("d.txt")','c = f.read()','print(c)'], b:1, h:'Close', e:'Use with', exp:'Files should be closed after use to free resources. Use with statement: with open("d.txt") as f: c = f.read(). It auto-closes the file', cat:'files', p:20, s:30 },
    { l:'JS', t:'Splice', c:['const a = [1,2,3,4];','const r = a.splice(1,2);','console.log(a);'], b:1, h:'Mutates', e:'Changes a', exp:'splice() modifies the original array AND returns removed elements. After splice(1,2), a is [1,4] not [1,2,3,4]. Use slice() for non-mutating', cat:'arrays', p:20, s:35 },
    { l:'PY', t:'Is', c:['a = [1,2]','b = [1,2]','if a is b:','  print("S")'], b:2, h:'Id', e:'Use ==', exp:'is checks if two variables point to the SAME object in memory. == checks if VALUES are equal. a and b are equal but different objects. Use == for value comparison', cat:'operators', p:20, s:35 },
    { l:'JS', t:'JSON', c:['const data = "{a:1}";','const obj = JSON.parse(data);'], b:0, h:'Format', e:'Invalid JSON', exp:'JSON requires double quotes for keys. {a:1} is not valid JSON. Use {"a":1}. JavaScript object literals use unquoted keys, but JSON strings must use double quotes', cat:'data', p:20, s:35 },
    { l:'PY', t:'Default', c:['def add(item, lst=[]):','  lst.append(item)','  return lst'], b:0, h:'Shared', e:'Mutable default', exp:'Default mutable arguments are shared across calls. All calls use the same list! Fix: def add(item, lst=None): lst = lst or []; lst.append(item); return lst', cat:'functions', p:20, s:40 },
    { l:'JS', t:'Reduce', c:['const nums = [1,2,3];','const sum = nums.reduce((a,b) => a+b);'], b:0, h:'Empty?', e:'Empty array error', exp:'reduce() without initial value throws TypeError on empty arrays. Always provide initial value: reduce((a,b) => a+b, 0). This also makes intent clearer', cat:'arrays', p:20, s:35 },
    { l:'PY', t:'Lambda', c:['fns = [lambda x: x+i for i in range(3)]','print([f(0) for f in fns])'], b:0, h:'Scope', e:'Prints [2,2,2]', exp:'Lambda captures variable i by reference, not value. By execution time, i is 2. Fix: lambda x, i=i: x+i to capture current value', cat:'scope', p:25, s:45 },
    { l:'JS', t:'Fetch', c:['fetch("/api")','.then(res => res.json())','.then(data => {','  return data.items;','})','.catch(e => console.log(e))'], b:0, h:'Errors', e:'Only catches network', exp:'fetch().catch() only catches network errors, not HTTP errors like 404. Check res.ok: if (!res.ok) throw new Error(res.status). Then catch will work for all errors', cat:'async', p:20, s:40 },
    { l:'PY', t:'Except', c:['try:','  x = 1/0','except:','  print("error")'], b:2, h:'Specific', e:'Bare except bad', exp:'Bare except catches ALL exceptions including SystemExit. Use except Exception or except ZeroDivisionError. Always specify which exceptions you expect', cat:'errors', p:20, s:35 },
    { l:'JS', t:'Map', c:['const arr = [1,2,3];','arr.map(x => x*2);','console.log(arr);'], b:1, h:'Original', e:'map returns new', exp:'map() returns a NEW array, it does not modify the original. To update arr: arr = arr.map(x => x*2). map is for transformation, not mutation', cat:'arrays', p:20, s:30 },
    { l:'PY', t:'Join', c:['words = ["hello","world"]','result = words.join(" ")'], b:1, h:'Wrong way', e:'Use " ".join()', exp:'In Python, join is a string method, not list method. Use " ".join(words). In JavaScript it is the opposite: words.join(" "). Easy to mix up!', cat:'strings', p:20, s:30 },
    { l:'JS', t:'Event', c:['const btn = document.querySelector("#btn");','btn.onclick = handleClick;','btn.onclick = handleOther;'], b:1, h:'Overwrite', e:'Second overwrites', exp:'onclick property can only hold one handler. Second assignment replaces first. Use addEventListener() to attach multiple handlers without overwriting', cat:'events', p:20, s:35 },
    { l:'PY', t:'Enumerate', c:['items = ["a","b","c"]','for i in items:','  print(i, items[i])'], b:1, h:'Index', e:'i is value', exp:'for i in items iterates VALUES, not indices. items[i] tries to use value as index. Fix: for i, val in enumerate(items): print(i, val)', cat:'loops', p:20, s:35 },
    { l:'JS', t:'Obj Copy', c:['const a = {x:1, y:{z:2}};','const b = {...a};','b.y.z = 99;','console.log(a.y.z);'], b:2, h:'Deep?', e:'Shallow copy', exp:'Spread operator makes SHALLOW copy. Nested objects are still referenced. a.y and b.y point to same object. Use structuredClone(a) or JSON.parse(JSON.stringify(a)) for deep copy', cat:'objects', p:25, s:45 },
    { l:'TS', t:'Interface', c:['interface User { name: string };','const u: User = { name: "Jo", age: 25 };'], b:2, h:'Extra?', e:'Extra prop error', exp:'TypeScript checks excess properties. Object literal with extra "age" not in interface causes error. Use type assertion or extend interface to include age', cat:'types', p:20, s:35 },
    { l:'TS', t:'Null', c:['function len(s: string | null) {','  return s.length;','}'], b:1, h:'Check null', e:'s may be null', exp:'Union with null requires narrowing. s.length throws if s is null. Fix: if (!s) return 0; or use s?.length (optional chaining)', cat:'types', p:20, s:35 },
    { l:'TS', t:'Generic', c:['function first<T>(arr: T[]): T {','  return arr[0];','}','const x = first([]);'], b:2, h:'Type?', e:'x is never', exp:'Empty array [] has type never[]. first([]) returns never. TypeScript cannot infer element type from empty array. Provide type: first<number>([])', cat:'generics', p:20, s:40 },
    { l:'RX', t:'Greedy', c:['const re = /<.*>/;','const m = "<b>hi</b>".match(re);','console.log(m[0]);'], b:2, h:'Greed', e:'Matches too much', exp:'* is greedy - matches as MUCH as possible. Matches "<b>hi</b>" entire string. Use *? for lazy: /<.*?>/ matches "<b>" only', cat:'regex', p:20, s:40 },
    { l:'RX', t:'Group', c:['const re = /(ab)+/;','console.log(re.test("abab"));','console.log(re.test("aba"));'], b:2, h:'Group', e:'aba passes too', exp:'(ab)+ matches "ab" one or more times. "abab" has "abab" (2 matches). "aba" has "ab" (1 match) then "a" - test still true because "ab" found!', cat:'regex', p:20, s:35 },
    { l:'RX', t:'Replace', c:['const s = "cat bat sat";','const r = s.replace(/.at/g, "dog");','console.log(r);'], b:2, h:'Replace', e:'Replaces all', exp:'. matches any char. /g flag replaces ALL matches. "cat bat sat" all match ".at". Result: "dog dog dog". Use specific char: /[cb]at/ for c or b', cat:'regex', p:20, s:30 },
    { l:'RE', t:'Memo', c:['const Child = ({val}) => {','  console.log("render");','  return <div>{val}</div>;','};','// Parent re-renders often'], b:2, h:'Optimize?', e:'Always re-renders', exp:'Child re-renders whenever Parent does, even if props same. Wrap in React.memo(): const Child = React.memo(({val}) => ...) to skip render when props unchanged', cat:'performance', p:20, s:40 },
    { l:'RE', t:'Effect Dep', c:['const [id, setId] = useState(1);','useEffect(() => {','  fetch("/api/" + id);','}, []);'], b:2, h:'Deps?', e:'Stale closure', exp:'Empty [] means effect runs only on mount with initial id=1. When id changes, effect wont re-run. Fix: add [id] to deps array to refetch on id change', cat:'hooks', p:20, s:40 },
    { l:'RE', t:'State Mut', c:['const [obj, setObj] = useState({n:1});','obj.n = 2;','setObj(obj);'], b:1, h:'Mutate?', e:'No re-render', exp:'Mutating state directly (obj.n=2) and passing same reference does not trigger re-render. Create new object: setObj({...obj, n:2}). React compares by reference', cat:'hooks', p:20, s:40 },
    { l:'TS', t:'Enum', c:['enum Color { Red, Green, Blue }','const c: Color = 0;','console.log(c === Color.Red);'], b:3, h:'Value?', e:'Prints true', exp:'This is correct! Numeric enums map names to numbers. Color.Red is 0. c: Color = 0 is valid. Both c and Color.Red equal 0, so comparison is true', cat:'types', p:20, s:35 },
    { l:'RE', t:'Cleanup', c:['useEffect(() => {','  const t = setInterval(() => tick(), 1000);','}, []);'], b:0, h:'Leak?', e:'Never cleared', exp:'setInterval without clearInterval causes memory leak. Return cleanup function: return () => clearInterval(t). Cleanup runs when component unmounts or deps change', cat:'hooks', p:25, s:45 },
  ],
  hard: [
    { l:'JS', t:'Closure', c:['for (var i = 0; i < 3; i++) {','  setTimeout(() => console.log(i), 100);','}'], b:0, h:'var', e:'Use let', exp:'var has function scope, not block scope. All timeouts share the same i variable. By the time they run, i is 3. let has block scope, each iteration gets its own i', cat:'closures', p:30, s:45 },
    { l:'PY', t:'Mutable', c:['def add(i, l=[]):','  l.append(i)','  return l'], b:0, h:'Shared', e:'Use None', exp:'Default arguments are evaluated ONCE when function is defined, not each call. All calls share the same list! Fix: def add(i, l=None): if l is None: l = []', cat:'functions', p:30, s:45 },
    { l:'JS', t:'Null', c:['const u = null;','if (u.name === "J") {','  console.log("F");','}'], b:1, h:'Check', e:'null.name err', exp:'Cannot read properties of null. Check before accessing: if (u && u.name === "J") or use optional chaining: u?.name === "J"', cat:'types', p:30, s:40 },
    { l:'JS', t:'Promise', c:['fetch("/a")','  .then(r => r.json())','  .then(d => console.log(d))','  .catch(e => console.log(e))','  .then(() => clean())'], b:4, h:'finally', e:'Use .finally()', exp:'The cleanup .then() runs even after errors (after catch). Use .finally() instead - it runs after success OR failure and does not receive a value', cat:'async', p:35, s:50 },
    { l:'PY', t:'Class', c:['class S:','  g = []','  def add(self, x):','    self.g.append(x)'], b:1, h:'Init', e:'Use __init__', exp:'grades is a CLASS variable shared by ALL instances. One student adding a grade affects all! Fix: define in __init__: self.g = [] for instance-specific data', cat:'oop', p:35, s:50 },
    { l:'JS', t:'Proxy', c:['const target = {};','const p = new Proxy(target, {','  set(t, k, v) { t[k] = v; return true; }','});','p.a = 1;','console.log(target.a);'], b:3, h:'Correct?', e:'Works correctly', exp:'This is actually correct! Proxy with set trap forwards the assignment to target. target.a will be 1. Proxies intercept operations on the proxy object, not the target directly', cat:'advanced', p:30, s:50 },
    { l:'PY', t:'Generator', c:['def gen():','  yield 1','  yield 2','  return 3','g = gen()','print(list(g) + list(g))'], b:5, h:'Twice?', e:'Second list() is empty', exp:'Generators are exhausted after iteration. First list(g) gets [1,2]. Second list(g) gets []. To iterate twice, call gen() again or convert to list first', cat:'generators', p:35, s:55 },
    { l:'JS', t:'WeakRef', c:['let obj = {data: "big"};','const ref = new WeakRef(obj);','obj = null;','console.log(ref.deref());'], b:3, h:'GC', e:'May be undefined', exp:'WeakRef allows garbage collection. After obj=null, deref() MAY return undefined if GC ran, or the object if not. Never rely on timing - always check: const val = ref.deref(); if (val) { ... }', cat:'memory', p:35, s:50 },
    { l:'PY', t:'Decorator', c:['def log(func):','  def wrapper(*args):','    print("call")','    return func(*args)','  return wrapper','@log','def greet(name):','  return f"Hi {name}"','print(greet.__name__)'], b:6, h:'Name', e:'Prints wrapper', exp:'Decorator replaces function with wrapper, losing metadata. Use @functools.wraps(func) on wrapper to preserve __name__, __doc__, etc. from original function', cat:'decorators', p:35, s:55 },
    { l:'JS', t:'Iterator', c:['const obj = {','  *[Symbol.iterator]() { yield 1; yield 2; }','};','const [a, b, c] = obj;','console.log(c);'], b:3, h:'Third?', e:'undefined', exp:'Iterator only yields 2 values. Destructuring with 3 variables gets undefined for third. Iterators can be shorter than expected - always validate or provide defaults', cat:'iterators', p:30, s:45 },
    { l:'PY', t:'Threading', c:['import threading','x = 0','def inc():','  global x','  for _ in range(1000000):','    x += 1','t1=threading.Thread(target=inc)','t2=threading.Thread(target=inc)','t1.start(); t2.start()','t1.join(); t2.join()','print(x)'], b:4, h:'Race', e:'Race condition', exp:'x += 1 is not atomic (read, add, write). Threads can interleave causing lost updates. Result may be < 2000000. Use threading.Lock() around x += 1', cat:'concurrency', p:40, s:60 },
    { l:'JS', t:'Proxy Trap', c:['const handler = {','  get(t, p) { return p in t ? t[p] : 42; }','};','const p = new Proxy({}, handler);','console.log(p.toString);'], b:4, h:'Method?', e:'Returns 42', exp:'Proxy intercepts ALL property access including built-in methods. p.toString is not in target, so returns 42. Fix: check for inherited methods: if (p in t || p in Object.prototype)', cat:'advanced', p:35, s:55 },
    { l:'PY', t:'Metaclass', c:['class Meta(type):','  def __new__(mcs, name, bases, dct):','    dct["added"] = True','    return super().__new__(mcs, name, bases, dct)','class Foo(metaclass=Meta): pass','print(Foo.added)'], b:4, h:'Works?', e:'Prints True', exp:'This code actually works correctly! Metaclass __new__ modifies class dict before creation. Foo.added will be True. Metaclasses customize class creation itself', cat:'oop', p:35, s:55 },
    { l:'JS', t:'Async Gen', c:['async function* gen() {','  yield 1; yield 2;','}','const g = gen();','console.log(g.next());'], b:4, h:'Value?', e:'Returns Promise', exp:'Async generators return {value: Promise, done: boolean}. Must await: (await g.next()).value. Regular generators return values directly. Async generators need for await...of', cat:'async', p:40, s:55 },
    { l:'PY', t:'Descriptor', c:['class Desc:','  def __get__(self, obj, type=None):','    return 42','class Foo:','  x = Desc()','print(Foo().x, Foo.x)'], b:5, h:'Both 42?', e:'Foo.x is Desc', exp:'Descriptor __get__ receives obj=None when accessed on class (Foo.x). With type=None check, Foo.x returns the Desc instance itself, not 42. Instance access (Foo().x) returns 42', cat:'oop', p:40, s:60 },
    { l:'TS', t:'Conditional', c:['type A<T> = T extends string ? "str" : "other";','type B = A<string | number>;'], b:1, h:'Distrib?', e:'B = "str" | "other"', exp:'Conditional types distribute over unions. A<string|number> becomes A<string> | A<number> = "str" | "other". Wrap in tuple to prevent: [T] extends [string]', cat:'types', p:35, s:50 },
    { l:'TS', t:'Mapped', c:['type RO<T> = { readonly [K in keyof T]: T[K] };','type U = RO<{a:1, b:2}>;','const x: U = {a:1, b:2};','x.a = 3;'], b:3, h:'Readonly?', e:'Cannot assign', exp:'Mapped type makes all properties readonly. x.a = 3 fails because a is readonly. Use Partial<T> for optional or create mutable version without readonly modifier', cat:'types', p:35, s:50 },
    { l:'TS', t:'Infer', c:['type Ret<T> = T extends (...a:any[]) => infer R ? R : never;','type A = Ret<() => void>;','type B = Ret<() => never>;'], b:3, h:'void/never', e:'A=void B=never', exp:'infer extracts return type. Ret<()=>void> extracts void. Ret<()=>never> extracts never. void and never are different: void means no return value, never means function never completes', cat:'types', p:40, s:55 },
    { l:'RX', t:'Lookahead', c:['const re = /\\d(?=px)/;','console.log("10px 20em 30px".match(re));'], b:3, h:'Look', e:'Matches ["1","3"]', exp:'(?=px) is positive lookahead - matches digit followed by "px" but only consumes the digit. "1" in "10px" and "3" in "30px" match. "2" in "20em" does not', cat:'regex', p:35, s:50 },
    { l:'RX', t:'Backref', c:['const re = /<([^>]+)>.*<\\/\\1>/;','console.log(re.test("<b>hi</b>"));','console.log(re.test("<b>hi</i>"));'], b:3, h:'Ref', e:'true then false', exp:'\\1 references first capture group. Matches <tag>...</tag> where closing tag matches opening. "<b>hi</b>" matches (\\1=b). "<b>hi</i>" fails because \\1=b but closing is i', cat:'regex', p:35, s:55 },
    { l:'RX', t:'Named', c:['const re = /(?<year>\\d{4})-(?<month>\\d{2})/;','const m = "2024-03".match(re);','console.log(m.groups.month, m[1]);'], b:3, h:'Named', e:'03 then 2024', exp:'Named groups (?<name>) accessible via m.groups.name. m[1] is first capture by index (year). m.groups.month is "03". Both named and indexed groups work', cat:'regex', p:35, s:50 },
    { l:'RE', t:'Ref', c:['const ref = useRef(0);','const handleClick = () => {','  ref.current++;','  setTimeout(() => console.log(ref.current), 1000);','};'], b:3, h:'Stale?', e:'Always current', exp:'useRef does NOT trigger re-render. ref.current holds mutable value. Unlike state, ref changes are immediate and dont cause renders. Good for values that shouldnt affect UI', cat:'hooks', p:35, s:50 },
    { l:'RE', t:'Context', c:['const Ctx = createContext(0);','function App() {','  return <Ctx.Provider value={0}>','    <Child />','  </Ctx.Provider>','}','function Child() {','  const v = useContext(Ctx);','}'], b:3, h:'Correct?', e:'Works fine', exp:'This is correct! createContext(0) sets default. Provider passes value to descendants. useContext reads nearest Provider value. Default only used without Provider in tree', cat:'context', p:35, s:55 },
    { l:'RE', t:'Batch', c:['const [a, setA] = useState(0);','const [b, setB] = useState(0);','const click = () => {','  setA(1); setB(2);','  console.log(a, b);','};'], b:4, h:'Batch?', e:'Still 0 0', exp:'React batches state updates. setA/setB dont update immediately. a and b still hold old values in same function. Updated values appear in next render. Use useEffect to log', cat:'hooks', p:40, s:55 },
    { l:'TS', t:'Assertion', c:['function isStr(x: unknown): x is string {','  return typeof x === "string";','}','const a: unknown = "hi";','if (isStr(a)) console.log(a.toUpperCase());'], b:4, h:'Guard?', e:'Works correctly', exp:'Type guards (x is string) narrow types in conditionals. Inside if block, TypeScript knows a is string, so a.toUpperCase() is valid. Custom type guards use type predicates', cat:'types', p:35, s:50 },
    { l:'RE', t:'Portal', c:['const Modal = () => createPortal(','  <div className="modal">Hi</div>,','  document.body',');'], b:4, h:'DOM?', e:'Renders in body', exp:'createPortal renders children into DOM node outside parent hierarchy. Modal renders in document.body but stays in React tree (events bubble, context works). Useful for modals/tooltips', cat:'advanced', p:40, s:55 },
  ]
}

const ST = [
  { id:'t10', n:'+10s', i:'10', d:'+10 seconds', pr:50, e:{t:'time',v:10} },
  { id:'t15', n:'+15s', i:'15', d:'+15 seconds', pr:75, e:{t:'time',v:15} },
  { id:'lf', n:'+1 Life', i:'+1', d:'Extra life', pr:100, e:{t:'life'} },
  { id:'rv', n:'Reveal', i:'?', d:'Show answer', pr:150, e:{t:'reveal'} },
  { id:'db', n:'2x', i:'x2', d:'Double pts', pr:80, e:{t:'double'} },
  { id:'sk', n:'Skip', i:'-', d:'Skip', pr:60, e:{t:'skip'} },
  { id:'hl', n:'Highlight', i:'[]', d:'Show bug', pr:120, e:{t:'highlight'} },
  { id:'sh', n:'Shield', i:'()', d:'Block hit', pr:90, e:{t:'shield'} },
  { id:'sf', n:'Safe', i:'+', d:'Keep streak', pr:70, e:{t:'streak'} },
]

const AC = [
  { id:'f', n:'First Bug', d:'1 challenge', c:s=>s.completed>=1 },
  { id:'s3', n:'Combo x3', d:'3 streak', c:s=>s.maxStreak>=3 },
  { id:'s5', n:'Combo x5', d:'5 streak', c:s=>s.maxStreak>=5 },
  { id:'sp', n:'Speed', d:'Under 5s', c:s=>s.fastest<5 },
  { id:'p100', n:'Century', d:'100 pts', c:s=>s.totalScore>=100 },
  { id:'p500', n:'Elite', d:'500 pts', c:s=>s.totalScore>=500 },
]

const gU=()=>JSON.parse(localStorage.getItem('bh_u')||'[]')
const sU=u=>localStorage.setItem('bh_u',JSON.stringify(u))
const gC=()=>JSON.parse(localStorage.getItem('bh_c')||'null')
const sC=u=>localStorage.setItem('bh_c',JSON.stringify(u))
const gD=id=>JSON.parse(localStorage.getItem('bh_d'+id)||'null')
const sD=(id,d)=>localStorage.setItem('bh_d'+id,JSON.stringify(d))
const sh=a=>{const s=[...a];for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]]}return s}

// Analytics
const track=(event,data={})=>{
  const analytics=JSON.parse(localStorage.getItem('bh_analytics')||'[]')
  analytics.push({event,data,time:Date.now()})
  if(analytics.length>1000)analytics.shift()
  localStorage.setItem('bh_analytics',JSON.stringify(analytics))
}

// Level System (1-50)
const MAX_LEVEL=50
const getLevel=score=>Math.min(MAX_LEVEL,Math.floor(score/150)+1)
const getXpForLevel=lv=>(lv-1)*150
const getXpForNext=lv=>lv>=MAX_LEVEL?Infinity:lv*150
const getXpProgress=score=>{const lv=getLevel(score);if(lv>=MAX_LEVEL)return{level:MAX_LEVEL,current:0,needed:0,percent:100};const prev=getXpForLevel(lv);const next=getXpForNext(lv);const cur=score-prev;return{level:lv,current:cur,needed:next-prev,percent:Math.floor((cur/(next-prev))*100)}}

// Concept Cards for Learning
const CONCEPTS = {
  loops: {
    title: 'Loops',
    icon: '🔄',
    color: '#3b82f6',
    content: [
      { title: 'For Loop', code: 'for (let i = 0; i < 5; i++) {\n  console.log(i);\n}', desc: 'Repeats code a specific number of times. Best when you know how many iterations.' },
      { title: 'While Loop', code: 'while (condition) {\n  // code\n}', desc: 'Repeats while condition is true. Use when iterations are unknown.' },
      { title: 'For...of', code: 'for (const item of array) {\n  console.log(item);\n}', desc: 'Iterates over iterable values (arrays, strings). Clean and simple.' },
    ]
  },
  arrays: {
    title: 'Arrays',
    icon: '📚',
    color: '#10b981',
    content: [
      { title: 'Create Array', code: 'const arr = [1, 2, 3];\nconst arr2 = new Array(5);', desc: 'Arrays store ordered lists. Zero-indexed: arr[0] is first element.' },
      { title: 'Array Methods', code: 'arr.push(4);      // Add end\narr.pop();        // Remove end\narr.shift();      // Remove start\narr.unshift(0);   // Add start', desc: 'Methods to add/remove elements. Push/pop are faster than shift/unshift.' },
      { title: 'Array Iteration', code: 'arr.map(x => x * 2)\narr.filter(x => x > 2)\narr.reduce((a, b) => a + b)', desc: 'Functional methods that return new arrays. Do not mutate original.' },
    ]
  },
  functions: {
    title: 'Functions',
    icon: '⚡',
    color: '#f59e0b',
    content: [
      { title: 'Function Declaration', code: 'function greet(name) {\n  return "Hello, " + name;\n}', desc: 'Hoisted - can be called before defined. Has its own "this".' },
      { title: 'Arrow Function', code: 'const greet = (name) => {\n  return "Hello, " + name;\n};', desc: 'Not hoisted. Lexical "this" - inherits from parent scope.' },
      { title: 'Parameters', code: 'function example(\n  required,\n  optional = "default",\n  ...rest\n) {}', desc: 'Default params, rest params. Arguments object available in regular functions.' },
    ]
  },
  types: {
    title: 'Types',
    icon: '📦',
    color: '#8b5cf6',
    content: [
      { title: 'Primitives', code: 'const str = "text";\nconst num = 42;\nconst bool = true;\nconst nothing = null;\nconst empty = undefined;', desc: 'Immutable values. Copied by value. typeof null is a known bug.' },
      { title: 'Type Coercion', code: '"5" + 3   // "53" string\n"5" - 3   // 2 number\n"5" == 5  // true\n"5" === 5 // false', desc: 'Plus concatenates strings. Other ops convert to numbers. Use === to avoid coercion.' },
      { title: 'Check Types', code: 'typeof "text"  // "string"\nArray.isArray([])  // true\nobj instanceof Object  // true', desc: 'typeof for primitives. instanceof for objects. Array.isArray() for arrays.' },
    ]
  },
  async: {
    title: 'Async/Await',
    icon: '⏳',
    color: '#ec4899',
    content: [
      { title: 'Promises', code: 'fetch("/api")\n  .then(res => res.json())\n  .then(data => console.log(data))\n  .catch(err => console.error(err));', desc: 'Promises handle async operations. Chain with .then(). Catch errors with .catch().' },
      { title: 'Async/Await', code: 'async function getData() {\n  try {\n    const res = await fetch("/api");\n    const data = await res.json();\n    return data;\n  } catch (err) {\n    console.error(err);\n  }\n}', desc: 'Syntactic sugar for promises. Makes async code look synchronous. Must use try/catch.' },
      { title: 'Promise.all', code: 'const [users, posts] = await Promise.all([\n  fetch("/users"),\n  fetch("/posts")\n]);', desc: 'Run multiple promises in parallel. Fails fast if any promise rejects.' },
    ]
  },
  scope: {
    title: 'Scope',
    icon: '🎯',
    color: '#06b6d4',
    content: [
      { title: 'Global vs Local', code: 'let global = "I am global";\n\nfunction test() {\n  let local = "I am local";\n  console.log(global);\n}\nconsole.log(local); // Error!', desc: 'Variables are scoped to their block/function. Inner can access outer, not vice versa.' },
      { title: 'Block Scope', code: 'if (true) {\n  let blockScoped = 1;\n  var functionScoped = 2;\n}\nconsole.log(functionScoped); // 2\nconsole.log(blockScoped); // Error!', desc: 'let/const are block-scoped. var is function-scoped. Avoid var.' },
      { title: 'Closures', code: 'function outer() {\n  let count = 0;\n  return function inner() {\n    return ++count;\n  };\n}\nconst counter = outer();\nconsole.log(counter()); // 1', desc: 'Functions remember their lexical scope. Inner function keeps access to outer variables.' },
    ]
  },
  oop: {
    title: 'OOP',
    icon: '🏗️',
    color: '#f97316',
    content: [
      { title: 'Classes', code: 'class Animal {\n  constructor(name) {\n    this.name = name;\n  }\n  speak() {\n    return this.name + " makes a sound";\n  }\n}', desc: 'Blueprints for objects. Constructor runs on new. Methods shared across instances.' },
      { title: 'Inheritance', code: 'class Dog extends Animal {\n  constructor(name, breed) {\n    super(name);\n    this.breed = breed;\n  }\n  speak() {\n    return this.name + " barks";\n  }\n}', desc: 'extends creates child class. super() calls parent constructor. Override methods as needed.' },
      { title: 'Static & Private', code: 'class Counter {\n  #count = 0;  // Private\n  static total = 0;  // Class-level\n  increment() {\n    this.#count++;\n    Counter.total++;\n  }\n}', desc: 'Static belongs to class, not instance. Private (#) is only accessible inside class.' },
    ]
  },
};

// Simulated API Backend with persistence
const API = {
  getLeaderboard: () => {
    const users = gU();
    return users.map(u => {
      const d = gD(u.id);
      return {
        username: u.u,
        score: d?.st?.totalScore || 0,
        games: d?.st?.games || 0,
        streak: d?.st?.maxStreak || 0,
        avatar: u.av,
        level: Math.floor((d?.st?.totalScore || 0) / 500) + 1,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 50);
  },
  syncScore: (userId, stats) => {
    track('sync', { userId, score: stats.totalScore });
    // In real app, this would POST to backend
    localStorage.setItem('bh_sync_' + userId, JSON.stringify({ stats, syncedAt: Date.now() }));
    return { success: true, syncedAt: Date.now() };
  },
  getPlayerRank: (username) => {
    const board = API.getLeaderboard();
    const rank = board.findIndex(p => p.username === username) + 1;
    return rank || board.length + 1;
  },
};

export default function App(){
  const[u,setU]=useState(null)
  const[am,setAm]=useState('login')
  const[f,setF]=useState({u:'',e:'',p:'',c:''})
  const[ae,setAe]=useState('')
  const[snd,setSnd]=useState(true)
  const[theme,setTheme]=useState(localStorage.getItem('bh_theme')||'dark')
  const[music,setMusic]=useState(false)
  const[musicStarted,setMusicStarted]=useState(false)
  const musicRef=useRef(null)
  const[isOffline,setIsOffline]=useState(!navigator.onLine)
  const[st,setSt]=useState('menu')
  const[md,setMd]=useState('classic')
  const[df,setDf]=useState('easy')
  const[cat,setCat]=useState('all')
  const[ix,setIx]=useState(0)
  const[qs,setQs]=useState([])
  const[sl,setSl]=useState(null)
  const[dn,setDn]=useState(false)
  const[sc,setSc]=useState(0)
  const[sk,setSk]=useState(0)
  const[ms,setMs]=useState(0)
  const[lv,setLv]=useState(3)
  const[hi,setHi]=useState(false)
  const[tl,setTl]=useState(0)
  const[qs2,setQs2]=useState(null)
  const[nt,setNt]=useState(null)
  const[cn,setCn]=useState(0)
  const[iv,setIv]=useState({})
  const[hl2,setHl2]=useState(null)
  const[sh2,setSh2]=useState(false)
  const[sf2,setSf2]=useState(false)
  const[db2,setDb2]=useState(false)
  const[ac,setAc]=useState([])
  const[pf,setPf]=useState(false)
  const[bk,setBk]=useState(false)
  const[bm,setBm]=useState([])
  const[bv,setBv]=useState(false)
  const[st2,setSt2]=useState({completed:0,maxStreak:0,fastest:Infinity,totalScore:0,games:0,bought:0})
  const[showConcepts,setShowConcepts]=useState(false)
  const[activeConcept,setActiveConcept]=useState(null)
  const[deferredPrompt,setDeferredPrompt]=useState(null)
  const[canInstall,setCanInstall]=useState(false)
  const[showAbout,setShowAbout]=useState(false)
  const[isIOS,setIsIOS]=useState(false)
  const[showIOSGuide,setShowIOSGuide]=useState(false)
  const[levelUp,setLevelUp]=useState(null)
  const[raceMode,setRaceMode]=useState(false)
  const[raceCode,setRaceCode]=useState('')
  const[raceData,setRaceData]=useState(null)
  const[raceTimes,setRaceTimes]=useState([])
  const[showRace,setShowRace]=useState(false)
  const[showJoinRace,setShowJoinRace]=useState(false)
  const[scoreAnims,setScoreAnims]=useState([])
  const[wrongs,setWrongs]=useState([])
  const[playground,setPlayground]=useState(false)
  const[pgLang,setPgLang]=useState('js')
  const[pgCode,setPgCode]=useState('// Write your JavaScript here\nfunction greet(name) {\n  return "Hello, " + name;\n}\n\nconsole.log(greet("World"));')
  const[pgOutput,setPgOutput]=useState([])
  const[pgRunning,setPgRunning]=useState(false)
  const[pgShowSnippets,setPgShowSnippets]=useState(false)
  const[pgFindOpen,setPgFindOpen]=useState(false)
  const[pgFind,setPgFind]=useState('')
  const[pgReplace,setPgReplace]=useState('')
  const[pgLineCount,setPgLineCount]=useState(6)
  const[pgHistory,setPgHistory]=useState([])
  const[pgHistoryIdx,setPgHistoryIdx]=useState(-1)
  const[pgCopied,setPgCopied]=useState(false)
  const[pgScriptsLoaded,setPgScriptsLoaded]=useState({js:true,python:false,typescript:false})
  const isStandalone=typeof window!=='undefined'&&(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone)

  const loadPgScript=(lang)=>{if(pgScriptsLoaded[lang])return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');if(lang==='python'){s.src='https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';s.onload=()=>{const s2=document.createElement('script');s2.src='https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js';s2.onload=()=>{setPgScriptsLoaded(p=>({...p,python:true}));resolve()};s2.onerror=reject;document.head.appendChild(s2)};s.onerror=reject}else if(lang==='typescript'){s.src='https://cdn.jsdelivr.net/npm/typescript@5.3.3/lib/typescript.min.js';s.onload=()=>{setPgScriptsLoaded(p=>({...p,typescript:true}));resolve()};s.onerror=reject}else{resolve();return}document.head.appendChild(s)})}

  const pl=useCallback(t=>{if(snd)ps(t)},[snd])
  const sn=(m,t='info')=>{setNt({m,t});setTimeout(()=>setNt(null),2000)}

  const toggleMusic=useCallback(()=>{
    if(!musicRef.current){
      musicRef.current=new Audio('/bg-music.mp3')
      musicRef.current.loop=true
      musicRef.current.volume=0.3
    }
    if(music){
      musicRef.current.pause()
      setMusic(false)
    }else{
      musicRef.current.play().catch(()=>{})
      setMusic(true)
      setMusicStarted(true)
    }
  },[music])

  useEffect(()=>{
    if(!musicStarted&&u){
      const startMusic=()=>{
        if(!musicRef.current){
          musicRef.current=new Audio('/bg-music.mp3')
          musicRef.current.loop=true
          musicRef.current.volume=0.3
        }
        musicRef.current.play().then(()=>{setMusic(true);setMusicStarted(true)}).catch(()=>{})
        document.removeEventListener('click',startMusic)
      }
      document.addEventListener('click',startMusic)
      return()=>document.removeEventListener('click',startMusic)
    }
  },[u,musicStarted])

  useEffect(()=>{
    const handleOnline=()=>setIsOffline(false)
    const handleOffline=()=>setIsOffline(true)
    window.addEventListener('online',handleOnline)
    window.addEventListener('offline',handleOffline)
    return()=>{
      window.removeEventListener('online',handleOnline)
      window.removeEventListener('offline',handleOffline)
    }
  },[])

  // PWA Install Prompt
  useEffect(()=>{
    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      sn('App installed!', 'success');
    }
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  useEffect(()=>{document.body.className=theme;localStorage.setItem('bh_theme',theme)},[theme])

  useEffect(()=>{const c=gC();if(c){setU(c);const d=gD(c.id);if(d){setCn(d.cn||0);setIv(d.iv||{});setSt2(d.st||st2);setAc(d.ac||[]);setBm(d.bm||[])}}},[])

  const sv=useCallback(()=>{if(u)sD(u.id,{cn,iv:iv,st:st2,ac,bm})},[u,cn,iv,st2,ac,bm])
  useEffect(()=>{if(u)sv()},[cn,iv,st2,ac,bm,sv])

  const sg=async e=>{e.preventDefault();setAe('');if(!f.u||!f.e||!f.p){setAe('All required');return}if(f.p.length<6){setAe('6+ chars');return}if(f.p!==f.c){setAe('No match');return}const us=gU();if(us.find(x=>x.e===f.e)){setAe('Email taken');return}if(us.find(x=>x.u===f.u)){setAe('User taken');return}const hp=await hashPwd(f.p);const n={id:Date.now().toString(),u:f.u,e:f.e,p:hp,av:f.u[0].toUpperCase()};us.push(n);sU(us);sD(n.id,{cn:500,iv:{},st:{completed:0,maxStreak:0,fastest:Infinity,totalScore:0,games:0,bought:0},ac:[],bm:[]});const{_p,...s}=n;sC(s);setU(s);setCn(500);setF({u:'',e:'',p:'',c:''});pl('ok');sn('Welcome '+n.u,'success')}

  const lg=async e=>{e.preventDefault();setAe('');if(!f.e||!f.p){setAe('Need email+pass');return}const hp=await hashPwd(f.p);const us=gU();const x=us.find(x=>x.e===f.e&&x.p===hp);if(!x){setAe('Invalid');return}const{_p,...s}=x;sC(s);setU(s);const d=gD(x.id);if(d){setCn(d.cn||0);setIv(d.iv||{});setSt2(d.st||st2);setAc(d.ac||[]);setBm(d.bm||[])};setF({u:'',e:'',p:'',c:''});pl('ok');sn('Welcome back','success')}

  const lo=()=>{localStorage.removeItem('bh_c');setU(null);setSt('menu');sn('Logged out','info')}

  const by=item=>{if(cn<item.pr){pl('err');sn('No coins','error');return}setCn(c=>c-item.pr);setIv(p=>({...p,[item.id]:(p[item.id]||0)+1}));setSt2(p=>({...p,bought:p.bought+1}));pl('ok');sn('Bought','success')}

  const ui=id=>{if(!iv[id]||iv[id]<=0)return;const item=ST.find(x=>x.id===id);if(!item)return;setIv(p=>({...p,[id]:p[id]-1}));pl('ok');const q=qs[ix];if(item.e.t==='time'){setTl(t=>t+item.e.v);sn('+'+item.e.v+'s','success')}else if(item.e.t==='life'){if(lv<5){setLv(l=>l+1);sn('+1','success')}else{setIv(p=>({...p,[id]:(p[id]||0)+1}));sn('Max','warning')}}else if(item.e.t==='reveal'&&q){setSl(q.b);setDn(true)}else if(item.e.t==='double'){setDb2(true);sn('2x on','success')}else if(item.e.t==='skip'){hn()}else if(item.e.t==='highlight'&&q){setHl2(q.b);sn('HL','success')}else if(item.e.t==='shield'){setSh2(true);sn('Shield','success')}else if(item.e.t==='streak'){setSf2(true);sn('Safe','success')}}

  const sg2=(l,m='classic',c='all')=>{setMd(m);setCat(c);const allQ=c==='all'?Q[l]:Q[l].filter(q=>q.cat===c);const qc=sh(allQ).slice(0,10);setQs(qc);setDf(l);setIx(0);setSl(null);setDn(false);setSc(0);setSk(0);setMs(0);setLv(m==='survival'?1:3);setHi(false);setTl(qc[0].s);setQs2(Date.now());setHl2(null);setSh2(false);setSf2(false);setDb2(false);setWrongs([]);setSt('play');setSt2(p=>({...p,games:p.games+1}));pl('ok')}

  const cq=qs[ix]||null

  useEffect(()=>{if(st!=='play'||dn||tl<=0||!cq)return;const t=setInterval(()=>{setTl(p=>{if(p<=1){setDn(true);pl('err');if(sh2){setSh2(false);sn('Saved','info')}else{setLv(l=>l-1)}if(!sf2)setSk(0);return 0}return p-1})},1000);return()=>clearInterval(t)},[st,dn,tl,cq,sh2,sf2])

  const sb=()=>{if(sl===null||!cq)return;setDn(true);const correct=sl===cq.b;const timeTaken=(Date.now()-qs2)/1000;track('answer',{correct,category:cq.cat,difficulty:df,timeTaken});if(raceMode)setRaceTimes(p=>[...p,{question:cq.t,time:timeTaken,correct}]);if(correct){let pts=cq.p;if(db2)pts*=2;const total=pts+Math.floor(tl*0.5)+sk*2;const prevLevel=getLevel(st2.totalScore);setSc(s=>s+total);setCn(c=>c+Math.floor(total*0.5));const ns=sk+1;setSk(ns);setMs(m=>Math.max(m,ns));setSt2(p=>{const newScore=p.totalScore+total;const newLevel=getLevel(newScore);if(newLevel>prevLevel&&prevLevel<MAX_LEVEL)setLevelUp(newLevel);return{...p,completed:p.completed+1,maxStreak:Math.max(p.maxStreak,ns),fastest:Math.min(p.fastest,(Date.now()-qs2)/1000),totalScore:newScore}});pl('ok');sn('+'+total,'success');const animId=Date.now();setScoreAnims(p=>[...p,{id:animId,val:total}]);setTimeout(()=>setScoreAnims(p=>p.filter(a=>a.id!==animId)),1200)    }else{pl('err');if(sh2){setSh2(false);sn('Saved','info')}else{setLv(l=>l-1)}if(!sf2)setSk(0);setWrongs(p=>[...p,{q:cq,sel:sl}])}setDb2(false);ca()}

  const hn=()=>{if(lv<=0||ix+1>=qs.length){setSt('over');if(lv<=0)pl('err')}else{setIx(i=>i+1);setSl(null);setDn(false);setHi(false);setHl2(null);setTl(qs[ix+1].s);setQs2(Date.now());pl('ok')}}

  const ca=()=>{AC.forEach(a=>{if(!ac.includes(a.id)&&a.c(st2)){setAc(p=>[...p,a.id]);setCn(c=>c+25);sn(a.n+'!','success')}})}

  const tb=q=>{if(bm.some(b=>b.t===q.t)){setBm(p=>p.filter(b=>b.t!==q.t));sn('Removed','info')}else{setBm(p=>[...p,q]);sn('Saved','success')}}

  const createRace=()=>{const allQ=Q[df];const qc=sh(allQ).slice(0,5);const code=btoa(JSON.stringify({id:Date.now().toString(),creator:u.u,questions:qc.map(q=>({l:q.l,t:q.t,c:q.c,b:q.b,h:q.h,e:q.e,exp:q.exp,cat:q.cat,p:q.p,s:q.s})),created:Date.now()}));navigator.clipboard.writeText(code).then(()=>sn('Challenge copied!','success')).catch(()=>sn('Copy failed','error'))}

  const joinRace=()=>{try{const data=JSON.parse(atob(raceCode));if(!data.questions||!data.creator){sn('Invalid code','error');return}setRaceData(data);setQs(data.questions);setIx(0);setSl(null);setDn(false);setSc(0);setSk(0);setMs(0);setLv(3);setTl(data.questions[0].s);setQs2(Date.now());setRaceTimes([]);setRaceMode(true);setWrongs([]);setSt('play');pl('ok');sn('Racing against '+data.creator+'!','success')}catch{sn('Invalid code','error')}}

  const runPg=async()=>{setPgRunning(true);setPgOutput([]);const logs=[];const fakeConsole={log:(...a)=>logs.push({t:'log',m:a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')}),error:(...a)=>logs.push({t:'error',m:a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')}),warn:(...a)=>logs.push({t:'warn',m:a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')}),info:(...a)=>logs.push({t:'info',m:a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')}),table:(d)=>logs.push({t:'log',m:JSON.stringify(d,null,2)}),clear:()=>{logs.length=0}};try{const start=performance.now();if(pgLang==='python'){if(!window.Sk){logs.push({t:'error',m:'Loading Python... try again'});setPgOutput(logs);setPgRunning(false);return}window.Sk.configure({output:(s)=>{logs.push({t:'log',m:s.replace(/\n$/,'')})},read:(x)=>{if(window.Sk.builtinFiles===undefined)throw new Error('File not found: '+x);return window.Sk.builtinFiles[x]}});await window.Sk.misceval.asyncToPromise(()=>window.Sk.importMainWithBody('<stdin>',false,pgCode,true));const ms=(performance.now()-start).toFixed(2);logs.push({t:'info',m:'✓ Done in '+ms+'ms'})}else if(pgLang==='typescript'){let code=pgCode;try{if(window.ts){const res=window.ts.transpileModule(pgCode,{compilerOptions:{target:window.ts.ScriptTarget.ES2020,module:window.ts.ModuleKind.None}});code=res.outputText}}catch(e){logs.push({t:'warn',m:'TS transpile: '+e.message})}const fn=new Function('console',code);fn(fakeConsole);const ms=(performance.now()-start).toFixed(2);logs.push({t:'info',m:'✓ Done in '+ms+'ms'})}else{const fn=new Function('console',pgCode);fn(fakeConsole);const ms=(performance.now()-start).toFixed(2);logs.push({t:'info',m:'✓ Done in '+ms+'ms'})}}catch(e){logs.push({t:'error',m:e.name+': '+e.message})}setPgOutput(logs);setPgRunning(false)}

  const pgPushHistory=(code)=>{setPgHistory(h=>{const nh=[...h,code].slice(-50);setPgHistoryIdx(nh.length-1);return nh})}
  const pgOnChange=(val)=>{pgPushHistory(pgCode);setPgCode(val);setPgLineCount(val.split('\n').length)}
  const pgUndo=()=>{setPgHistoryIdx(i=>{if(i<=0)return 0;const ni=i-1;setPgCode(pgHistory[ni]);return ni})}
  const pgRedo=()=>{setPgHistoryIdx(i=>{if(i>=pgHistory.length-1)return i;const ni=i+1;setPgCode(pgHistory[ni]);return ni})}
  const pgFormat=()=>{pgPushHistory(pgCode);try{let lines=pgCode.split('\n');let indent=0;const formatted=lines.map(line=>{let t=line.trim();if(!t)return '';const closeFirst=/^[}\])]/.test(t);if(closeFirst)indent=Math.max(0,indent-1);const out='  '.repeat(indent)+t;if(/[{\[(]$/.test(t)||/^[^{]*\{/.test(t)&&!/(=>\s*\{|function.*\{)/.test(t)){if(/[{(\[]$/.test(t))indent++}if(/[}\])]$/.test(t)&&!closeFirst)indent=Math.max(0,indent-1);return out}).join('\n');setPgCode(formatted);setPgLineCount(formatted.split('\n').length);sn('Formatted','success')}catch{sn('Format error','error')}}
  const pgMinify=()=>{pgPushHistory(pgCode);const min=pgCode.replace(/\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{}();,:+\-*/<>=!&|?[\]])\s*/g,'$1').trim();setPgCode(min);setPgLineCount(1);sn('Minified','success')}
  const pgCopy=()=>{navigator.clipboard.writeText(pgCode).then(()=>{setPgCopied(true);setTimeout(()=>setPgCopied(false),2000);sn('Copied','success')}).catch(()=>sn('Copy failed','error'))}
  const pgDownload=()=>{const ext=pgLang==='python'?'.py':pgLang==='typescript'?'.ts':'.js';const mime=pgLang==='python'?'text/x-python':pgLang==='typescript'?'text/typescript':'text/javascript';const blob=new Blob([pgCode],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='script'+ext;a.click();URL.revokeObjectURL(url);sn('Downloaded','success')}
  const pgFindNext=()=>{if(!pgFind)return;const idx=pgCode.toLowerCase().indexOf(pgFind.toLowerCase());if(idx>=0){const ta=document.querySelector('.pg-editor');if(ta){ta.focus();ta.setSelectionRange(idx,idx+pgFind.length)}}else sn('Not found','warning')}
  const pgDoReplace=()=>{if(!pgFind)return;const re=new RegExp(pgFind.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');const newCode=pgCode.replace(re,pgReplace);pgPushHistory(pgCode);setPgCode(newCode);sn('Replaced','success')}
  const pgDoReplaceAll=()=>{if(!pgFind)return;const re=new RegExp(pgFind.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');const count=(pgCode.match(re)||[]).length;if(!count){sn('Not found','warning');return}const newCode=pgCode.replace(re,pgReplace);pgPushHistory(pgCode);setPgCode(newCode);sn(count+' replaced','success')}
  const pgCountAll=()=>{if(!pgFind)return;const re=new RegExp(pgFind.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');const count=(pgCode.match(re)||[]).length;sn(count+' found',count?'success':'warning')}
  const pgSnippetTemplates=[
    {n:'For Loop',c:'for (let i = 0; i < 10; i++) {\n  console.log(i);\n}',l:'js'},
    {n:'Array Methods',c:'const arr = [1, 2, 3, 4, 5];\nconsole.log(arr.map(x => x * 2));\nconsole.log(arr.filter(x => x > 2));\nconsole.log(arr.reduce((a, b) => a + b, 0));',l:'js'},
    {n:'Fetch API',c:'fetch("https://jsonplaceholder.typicode.com/todos/1")\n  .then(res => res.json())\n  .then(data => console.log(data))\n  .catch(err => console.error(err));',l:'js'},
    {n:'Async/Await',c:'async function loadData() {\n  try {\n    const res = await fetch("https://jsonplaceholder.typicode.com/users");\n    const data = await res.json();\n    console.log(data.map(u => u.name));\n  } catch (err) {\n    console.error(err);\n  }\n}\nloadData();',l:'js'},
    {n:'Class',c:'class Animal {\n  constructor(name, sound) {\n    this.name = name;\n    this.sound = sound;\n  }\n  speak() {\n    return `${this.name} says ${this.sound}`;\n  }\n}\n\nconst dog = new Animal("Dog", "Woof");\nconsole.log(dog.speak());',l:'js'},
    {n:'Promise.all',c:'const delay = (ms, val) => new Promise(r => setTimeout(() => r(val), ms));\n\nPromise.all([\n  delay(100, "first"),\n  delay(200, "second"),\n  delay(50, "third")\n]).then(results => console.log(results));',l:'js'},
    {n:'Closure',c:'function createCounter() {\n  let count = 0;\n  return {\n    increment: () => ++count,\n    decrement: () => --count,\n    getCount: () => count\n  };\n}\n\nconst counter = createCounter();\nconsole.log(counter.increment()); // 1\nconsole.log(counter.increment()); // 2\nconsole.log(counter.decrement()); // 1',l:'js'},
    {n:'Error Handling',c:'function divide(a, b) {\n  if (b === 0) throw new Error("Cannot divide by zero");\n  return a / b;\n}\n\ntry {\n  console.log(divide(10, 2));\n  console.log(divide(10, 0));\n} catch (e) {\n  console.error(e.message);\n} finally {\n  console.log("Done");\n}',l:'js'},
    {n:'Event Loop',c:'console.log("1: Start");\n\nsetTimeout(() => console.log("2: Timeout"), 0);\n\nPromise.resolve().then(() => console.log("3: Promise"));\n\nconsole.log("4: End");\n// Order: 1, 4, 3, 2',l:'js'},
    {n:'Debounce',c:'function debounce(fn, delay) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  };\n}\n\nconst log = debounce(console.log, 300);\nlog("a"); log("b"); log("c");\n// Only "c" logs after 300ms',l:'js'},
    {n:'Hello World',c:'print("Hello, World!")\n\nname = "Python"\nprint(f"Welcome to {name}!")',l:'python'},
    {n:'Lists',c:'nums = [1, 2, 3, 4, 5]\nprint(nums)\nprint(nums[0])\nprint(nums[-1])\nprint(nums[1:3])\n\nsquared = [x**2 for x in nums]\nprint(squared)',l:'python'},
    {n:'Functions',c:'def greet(name, greeting="Hello"):\n    return f"{greeting}, {name}!"\n\nprint(greet("Alice"))\nprint(greet("Bob", "Hi"))\n\n# Lambda\nsquare = lambda x: x ** 2\nprint(square(5))',l:'python'},
    {n:'Dict & Loop',c:'scores = {"Alice": 85, "Bob": 92, "Charlie": 78}\n\nfor name, score in scores.items():\n    print(f"{name}: {score}")\n\n# Dict comprehension\npassed = {k: v for k, v in scores.items() if v >= 80}\nprint(passed)',l:'python'},
    {n:'Classes',c:'class Dog:\n    def __init__(self, name, breed):\n        self.name = name\n        self.breed = breed\n    \n    def speak(self):\n        return f"{self.name} says Woof!"\n\nrex = Dog("Rex", "German Shepherd")\nprint(rex.speak())\nprint(f"Breed: {rex.breed}")',l:'python'},
    {n:'Interface',c:'interface User {\n  name: string;\n  age: number;\n  email?: string;\n}\n\nconst user: User = {\n  name: "Alice",\n  age: 25\n};\n\nconsole.log(`${user.name} is ${user.age}`);',l:'typescript'},
    {n:'Generics',c:'function identity<T>(arg: T): T {\n  return arg;\n}\n\nconst num = identity<number>(42);\nconst str = identity<string>("hello");\n\nconsole.log(num, str);\n\n// Generic array\nfunction first<T>(arr: T[]): T | undefined {\n  return arr[0];\n}\nconsole.log(first([1, 2, 3]));',l:'typescript'},
    {n:'Type Guards',c:'type StringOrNumber = string | number;\n\nfunction processValue(val: StringOrNumber): string {\n  if (typeof val === "string") {\n    return val.toUpperCase();\n  }\n  return val.toFixed(2);\n}\n\nconsole.log(processValue("hello"));\nconsole.log(processValue(3.14159));',l:'typescript'},
  ]

  if(!u)return(<div className="app minimal"><div className="auth-container"><div className="brand">W<span className="dot">.</span></div><h1 className="auth-title">{am==='login'?'Sign In':'Sign Up'}</h1><form onSubmit={am==='login'?lg:sg} className="auth-form">{am==='signup'&&<div className="form-group"><label>User</label><input value={f.u} onChange={e=>setF(p=>({...p,u:e.target.value}))}/></div>}<div className="form-group"><label>Email</label><input type="email" value={f.e} onChange={e=>setF(p=>({...p,e:e.target.value}))}/></div><div className="form-group"><label>Password</label><input type="password" value={f.p} onChange={e=>setF(p=>({...p,p:e.target.value}))}/></div>{am==='signup'&&<div className="form-group"><label>Confirm</label><input type="password" value={f.c} onChange={e=>setF(p=>({...p,c:e.target.value}))}/></div>}{ae&&<div className="auth-error">{ae}</div>}<button type="submit" className="btn-main">{am==='login'?'Sign In':'Sign Up'}</button></form><div className="auth-switch">{am==='login'?<span>No account? <button onClick={()=>{setAm('signup');setAe('')}}>Sign up</button></span>:<span>Have account? <button onClick={()=>{setAm('login');setAe('')}}>Sign in</button></span>}</div></div></div>)

  // Concept Cards
  if(showConcepts && !activeConcept){
    return(
      <div className="app minimal">
        <div className="center-content wide">
          <div className="brand small">W<span className="dot">.</span></div>
          <h2 className="section-title">Learn Concepts</h2>
          <div className="concepts-grid">
            {Object.entries(CONCEPTS).map(([key, concept])=>(
              <button key={key} className="concept-card" style={{'--concept-color':concept.color}} onClick={()=>{pl('ok');setActiveConcept(key)}}>
                <span className="concept-icon">{concept.icon}</span>
                <span className="concept-title">{concept.title}</span>
                <span className="concept-count">{concept.content.length} topics</span>
              </button>
            ))}
          </div>
          <button className="btn-back" onClick={()=>setShowConcepts(false)}>back</button>
        </div>
      </div>
    )
  }

  // Active Concept Detail
  if(showConcepts && activeConcept){
    const concept = CONCEPTS[activeConcept];
    return(
      <div className="app minimal">
        <div className="center-content wide">
          <div className="brand small">W<span className="dot">.</span></div>
          <div className="concept-header" style={{'--concept-color':concept.color}}>
            <span className="concept-icon-lg">{concept.icon}</span>
            <h2 className="section-title">{concept.title}</h2>
          </div>
          <div className="concept-content">
            {concept.content.map((item, i)=>(
              <div key={i} className="concept-item">
                <h3 className="concept-item-title">{item.title}</h3>
                <pre className="concept-code"><code>{item.code}</code></pre>
                <p className="concept-desc">{item.desc}</p>
              </div>
            ))}
          </div>
          <button className="btn-back" onClick={()=>setActiveConcept(null)}>← topics</button>
        </div>
      </div>
    )
  }

  if(pf){const xp=getXpProgress(st2.totalScore);return(<div className="app minimal"><div className="center-content"><div className="profile-header"><div className="avatar">{u.av}</div><div className="profile-info"><span className="profile-name">{u.u}</span><span className="profile-email">{u.e}</span><span className="level-badge">Lv {xp.level}</span></div></div><div className="stats-grid"><div className="stat-card"><span className="stat-num">{st2.totalScore}</span><span className="stat-label">Score</span></div><div className="stat-card"><span className="stat-num">{st2.completed}</span><span className="stat-label">Found</span></div><div className="stat-card"><span className="stat-num">{cn}</span><span className="stat-label">Coins</span></div></div><div className="profile-actions"><button className="btn-back" onClick={()=>setPf(false)}>back</button><button className="btn-logout" onClick={lo}>Sign Out</button></div></div></div>)}

  if(bk){const all=API.getLeaderboard();return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Leaderboard</h2><div className="leaderboard-list">{all.map((e,i)=><div key={i} className={`leaderboard-item ${e.username===u.u?'current':''}`}><span className="rank">#{i+1}</span><span className="lb-name">{e.username}</span><span className="lb-level">Lv {getLevel(e.score)}</span><span className="lb-score">{e.score}</span></div>)}</div><button className="btn-back" onClick={()=>setBk(false)}>back</button></div></div>)}

  if(bv)return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Bookmarks</h2>{bm.length===0?<p>No bookmarks</p>:<div className="bookmarks-list">{bm.map((b,i)=><div key={i} className="bookmark-item"><span className="bm-lang">{b.l}</span><span className="bm-title">{b.t}</span><button className="bm-remove" onClick={()=>setBm(p=>p.filter((_,j)=>j!==i))}>x</button></div>)}</div>}<button className="btn-back" onClick={()=>setBv(false)}>back</button></div></div>)

  if(playground)return(
    <div className="app minimal">
      <div className="center-content playground-wrap">
        <div className="playground-header">
          <div className="brand small">W<span className="dot">.</span></div>
          <h2 className="section-title">Playground</h2>
          <div className="pg-lang-tabs">
            <button className={`pg-lang-tab ${pgLang==='js'?'active':''}`} onClick={()=>{setPgLang('js');setPgCode('// JavaScript\nconsole.log("Hello, World!");');setPgLineCount(2)}}>JS</button>
            <button className={`pg-lang-tab ${pgLang==='python'?'active':''}`} onClick={()=>{setPgLang('python');setPgCode('# Python\nprint("Hello, World!")');setPgLineCount(2);loadPgScript('python')}}>PY</button>
            <button className={`pg-lang-tab ${pgLang==='typescript'?'active':''}`} onClick={()=>{setPgLang('typescript');setPgCode('// TypeScript\nconst msg: string = "Hello, World!";\nconsole.log(msg);');setPgLineCount(3);loadPgScript('typescript')}}>TS</button>
          </div>
        </div>
        <div className="pg-toolbar">
          <div className="pg-toolbar-row">
            <button className="btn-run" onClick={runPg} disabled={pgRunning}>{pgRunning?'Running...':'Run'}</button>
            <div className="pg-tool-group">
              <button className="pg-tool-btn" onClick={pgFormat} title="Format/Beautify">{'}'}</button>
              <button className="pg-tool-btn" onClick={pgMinify} title="Minify">{'<>'}</button>
              <button className="pg-tool-btn" onClick={()=>{pgPushHistory(pgCode);setPgCode('');setPgLineCount(1)}} title="New file">+</button>
            </div>
            <div className="pg-tool-group">
              <button className="pg-tool-btn" onClick={pgUndo} disabled={pgHistoryIdx<=0} title="Undo">&#x21A9;</button>
              <button className="pg-tool-btn" onClick={pgRedo} disabled={pgHistoryIdx>=pgHistory.length-1} title="Redo">&#x21AA;</button>
            </div>
            <div className="pg-tool-group">
              <button className={`pg-tool-btn ${pgCopied?'copied':''}`} onClick={pgCopy} title="Copy">&#x2398;</button>
              <button className="pg-tool-btn" onClick={pgDownload} title="Download .js">&#x2913;</button>
            </div>
            <div className="pg-tool-group">
              <button className={`pg-tool-btn ${pgFindOpen?'active':''}`} onClick={()=>setPgFindOpen(v=>!v)} title="Find & Replace">&#x1F50D;</button>
              <button className={`pg-tool-btn ${pgShowSnippets?'active':''}`} onClick={()=>setPgShowSnippets(v=>!v)} title="Snippets">&#x1F4CB;</button>
            </div>
            <button className="pg-tool-btn" onClick={()=>setPgOutput([])} title="Clear output">&#x2327;</button>
          </div>
          {pgFindOpen&&<div className="pg-find-bar">
            <input className="pg-find-input" placeholder="Find..." value={pgFind} onChange={e=>setPgFind(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();pgFindNext()}}} />
            <input className="pg-find-input" placeholder="Replace..." value={pgReplace} onChange={e=>setPgReplace(e.target.value)} />
            <div className="pg-find-actions">
              <button className="pg-find-btn" onClick={pgFindNext}>Next</button>
              <button className="pg-find-btn" onClick={pgDoReplace}>Replace</button>
              <button className="pg-find-btn" onClick={pgDoReplaceAll}>All</button>
              <button className="pg-find-btn" onClick={pgCountAll}>Count</button>
            </div>
          </div>}
          {pgShowSnippets&&<div className="pg-snippets-bar">
            <div className="pg-snippets-label">Snippets</div>
            <div className="pg-snippets-list">
              {pgSnippetTemplates.filter(s=>s.l===pgLang||(pgLang!=='python'&&pgLang!=='typescript'&&s.l==='js')||(!s.l)).map((s,i)=><button key={i} className="pg-snippet-btn" onClick={()=>{pgPushHistory(pgCode);setPgCode(s.c);setPgLineCount(s.c.split('\n').length);setPgShowSnippets(false)}}>{s.n}</button>)}
            </div>
          </div>}
        </div>
        <div className="pg-stats-row">
          <span className="pg-stat">{pgLineCount} lines</span>
          <span className="pg-stat">{pgCode.length} chars</span>
          <span className="pg-stat">Ctrl+Enter to run</span>
        </div>
        <div className="pg-editor-wrap">
          <div className="pg-line-numbers">{Array.from({length:pgLineCount},(_, i)=><div key={i} className="pg-ln">{i+1}</div>)}</div>
          <textarea className="pg-editor" value={pgCode} onChange={e=>pgOnChange(e.target.value)} spellCheck={false} onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();const{selectionStart:s,selectionEnd:n}=e.target;const v=e.target.value;const newCode=v.substring(0,s)+'  '+v.substring(n);pgPushHistory(pgCode);setPgCode(newCode);setPgLineCount(newCode.split('\n').length);setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=s+2},0)}else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runPg()}else if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();if(e.shiftKey)pgRedo();else pgUndo()}else if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();setPgFindOpen(true)}}} placeholder="Write JavaScript here..." />
        </div>
        <div className="pg-output-wrap">
          <div className="pg-output-header"><span className="pg-output-label">Console</span>{pgOutput.length>0&&<span className="pg-output-count">{pgOutput.length}</span>}</div>
          <div className="pg-output">
            {pgOutput.length===0?<span className="pg-output-empty">Press Run or Ctrl+Enter</span>:pgOutput.map((line,i)=><div key={i} className={`pg-line pg-${line.t}`}>{line.t==='error'?'✕ ':line.t==='warn'?'⚠ ':''}{line.m}</div>)}
          </div>
        </div>
        <div className="pg-shortcuts">
          <span className="pg-short"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> Run</span>
          <span className="pg-short"><kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo</span>
          <span className="pg-short"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> Redo</span>
          <span className="pg-short"><kbd>Ctrl</kbd>+<kbd>F</kbd> Find</span>
          <span className="pg-short"><kbd>Tab</kbd> Indent</span>
        </div>
        <button className="btn-back" onClick={()=>{setPlayground(false);setPgShowSnippets(false);setPgFindOpen(false)}}>back</button>
      </div>
    </div>
  )

  if(st==='menu')return(<><div className="app minimal"><div className="center-content"><div className="menu-header"><div className="brand">W<span className="dot">.</span></div><div className="header-buttons">{isOffline&&<span className="offline-badge">Offline</span>}<button className="info-btn" onClick={()=>setShowAbout(true)} title="About">!</button><button className={`music-btn ${music?'playing':''}`} onClick={toggleMusic} title={music?'Mute Music':'Play Music'}>{music?'♪':'♫'}</button><button className="theme-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} title="Toggle theme">{theme==='dark'?'☀':'☾'}</button><button className="user-btn" onClick={()=>setPf(true)}><span className="user-avatar">{u.av}</span></button></div></div><h1 className="title">Bug Hunter</h1><p className="tagline">Find the bug</p><div className="coin-display"><span className="coin-icon">◇</span><span className="coin-value">{cn}</span></div>{!isStandalone&&(canInstall||isIOS)&&<button className="install-btn" onClick={()=>{if(canInstall){installPWA()}else{setShowIOSGuide(true)}}}><span className="install-icon">📲</span> Install App</button>}<div className="menu-actions"><button className="btn-main" onClick={()=>{pl('ok');track('start_game');setSt('modes')}}>Play</button><button className="btn-ghost" onClick={()=>{pl('ok');setSt('store')}}>Store</button><button className="btn-ghost" onClick={()=>{pl('ok');setSt('inv')}}>Items</button><button className="btn-ghost" onClick={()=>setShowConcepts(true)}>Learn</button><button className="btn-ghost" onClick={()=>setBk(true)}>Board</button><button className="btn-ghost" onClick={()=>setBv(true)}>Marks</button><button className="btn-ghost" onClick={()=>setSt('ach')}>Awards</button><button className="btn-ghost" onClick={()=>{pl('ok');setPlayground(true)}}>Code</button></div>{(()=>{const xp=getXpProgress(st2.totalScore);return<div className="level-section"><div className="level-header"><span className="level-badge">Lv {xp.level}</span><span className="level-xp">{xp.level>=MAX_LEVEL?'MAX':xp.current+'/'+xp.needed+' XP'}</span></div><div className="xp-bar"><div className="xp-fill" style={{width:xp.percent+'%'}}></div></div></div>})()}<div className="stats-row"><div className="stat-item"><span className="stat-num">{st2.totalScore}</span><span className="stat-label">Score</span></div><div className="stat-item"><span className="stat-num">{st2.completed}</span><span className="stat-label">Found</span></div><div className="stat-item"><span className="stat-num">{st2.maxStreak}x</span><span className="stat-label">Streak</span></div></div></div>{nt&&<div className={`toast ${nt.t}`}>{nt.m}</div>}{showAbout&&<div className="about-overlay" onClick={()=>setShowAbout(false)}><div className="about-modal" onClick={e=>e.stopPropagation()}><div className="about-brand">W<span className="about-dot">.</span></div><h2 className="about-title">Bug Hunter</h2><div className="about-dev"><span className="about-label">Developed by</span><span className="about-name">WATASHI</span></div><div className="about-version">v1.0.0</div><button className="about-close" onClick={()=>setShowAbout(false)}>Close</button></div></div>}</div>{showIOSGuide&&<div className="ios-guide-overlay" onClick={()=>setShowIOSGuide(false)}><div className="ios-guide-modal" onClick={e=>e.stopPropagation()}><div className="ios-guide-header"><span className="ios-guide-icon">📲</span><h3>Install Bug Hunter</h3></div><div className="ios-guide-steps"><div className="ios-step"><span className="ios-step-num">1</span><span>Tap the <strong>Share</strong> button at the bottom of Safari</span></div><div className="ios-step"><span className="ios-step-num">2</span><span>Scroll down and tap <strong>"Add to Home Screen"</strong></span></div><div className="ios-step"><span className="ios-step-num">3</span><span>Tap <strong>"Add"</strong> in the top right corner</span></div></div><button className="ios-guide-close" onClick={()=>setShowIOSGuide(false)}>Got it</button></div></div>}</>)

  if(st==='modes')return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Mode</h2><div className="mode-list"><button className="mode-item" onClick={()=>setSt('classic')}><span className="mode-icon">●</span><div className="mode-info"><span className="mode-name">Classic</span><span className="mode-desc">10 questions</span></div></button><button className="mode-item" onClick={()=>setSt('survival')}><span className="mode-icon">♥</span><div className="mode-info"><span className="mode-name">Survival</span><span className="mode-desc">1 life</span></div></button><button className="mode-item" onClick={()=>setShowRace(true)}><span className="mode-icon">⚡</span><div className="mode-info"><span className="mode-name">Race</span><span className="mode-desc">Challenge friends</span></div></button></div><button className="btn-back" onClick={()=>setSt('menu')}>back</button></div></div>)

  if(st==='classic'||st==='survival')return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Difficulty</h2><div className="difficulty-list">{[['easy','10 pts'],['medium','20 pts'],['hard','30 pts']].map(([l,i])=>(<button key={l} className="diff-item" onClick={()=>{setDf(l);setSt('categories')}}><span className="diff-icon">{l==='easy'?'○':l==='medium'?'◐':'●'}</span><span className="diff-name">{l}</span><span className="diff-info">{i}</span></button>))}</div><button className="btn-back" onClick={()=>setSt('modes')}>back</button></div></div>)

  if(st==='categories'){const cats=[...new Set(Object.values(Q).flat().map(q=>q.cat))].sort();return(<div className="app minimal"><div className="center-content wide"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Category</h2><div className="category-list-wrap"><button className="cat-item" onClick={()=>sg2(df,md,'all')}><span className="cat-icon">◎</span><span className="cat-name">All Topics</span><span className="cat-count">{Q[df].length}</span></button>{cats.map(c=>{const count=Q[df].filter(q=>q.cat===c).length;return count>0?<button key={c} className="cat-item" onClick={()=>sg2(df,md,c)}><span className="cat-icon">›</span><span className="cat-name">{c}</span><span className="cat-count">{count}</span></button>:null})}</div><button className="btn-back" onClick={()=>setSt(md)}>back</button></div></div>)}

  if(st==='store')return(<div className="app minimal"><div className="center-content wide"><div className="brand small">W<span className="dot">.</span></div><div className="store-header"><h2 className="section-title">Store</h2><div className="coin-display small"><span className="coin-icon">◇</span><span className="coin-value">{cn}</span></div></div><div className="store-items">{ST.map(item=>(<div key={item.id} className="shop-item"><div className="item-left"><span className="item-icon">{item.i}</span><div className="item-details"><span className="item-name">{item.n}</span><span className="item-desc">{item.d}</span></div></div><div className="item-right">{iv[item.id]>0&&<span className="owned-count">x{iv[item.id]}</span>}<button className="btn-buy" onClick={()=>by(item)} disabled={cn<item.pr}><span className="buy-price">◇ {item.pr}</span></button></div></div>))}</div><button className="btn-back" onClick={()=>setSt('menu')}>back</button></div></div>)

  if(st==='inv'){const ow=ST.filter(i=>iv[i.id]>0);return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Inventory</h2>{ow.length===0?<p>No items</p>:<div className="inventory-list">{ow.map(i=><div key={i.id} className="inv-item"><span className="item-icon">{i.i}</span><span className="item-name">{i.n}</span><span className="item-qty">x{iv[i.id]}</span></div>)}</div>}<button className="btn-back" onClick={()=>setSt('menu')}>back</button></div></div>)}

  if(showRace)return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Race Mode</h2><div className="mode-list"><button className="mode-item" onClick={()=>{setShowRace(false);setSt('classic');setRaceMode(true);createRace()}}><span className="mode-icon">→</span><div className="mode-info"><span className="mode-name">Create Challenge</span><span className="mode-desc">Share code with friends</span></div></button><button className="mode-item" onClick={()=>{setShowRace(false);setShowJoinRace(true)}}><span className="mode-icon">←</span><div className="mode-info"><span className="mode-name">Join Race</span><span className="mode-desc">Enter challenge code</span></div></button></div><button className="btn-back" onClick={()=>{setShowRace(false);setRaceMode(false)}}>back</button></div></div>)

  if(showJoinRace)return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Join Race</h2><div className="auth-form"><div className="form-group"><label>Challenge Code</label><textarea className="race-code-input" value={raceCode} onChange={e=>setRaceCode(e.target.value)} placeholder="Paste challenge code here..." rows={4}/></div><button className="btn-main" onClick={()=>{setShowJoinRace(false);joinRace()}}>Start Race</button></div><button className="btn-back" onClick={()=>{setShowJoinRace(false);setRaceMode(false)}}>back</button></div></div>)

  if(st==='ach')return(<div className="app minimal"><div className="center-content"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">Achievements</h2><div className="awards-list">{AC.map(a=><div key={a.id} className={`award-item ${ac.includes(a.id)?'unlocked':''}`}><span className="award-icon">{ac.includes(a.id)?'●':'○'}</span><div className="award-info"><span className="award-name">{a.n}</span><span className="award-desc">{a.d}</span></div></div>)}</div><button className="btn-back" onClick={()=>setSt('menu')}>back</button></div></div>)

  if(st==='over'){const xp=getXpProgress(st2.totalScore);return(<div className="app minimal"><div className="center-content wide"><div className="brand small">W<span className="dot">.</span></div><h2 className="section-title">{lv>0?'Complete':'Game Over'}</h2><div className="results-grid"><div className="result-item"><span className="result-label">Score</span><span className="result-value">{sc}</span></div><div className="result-item"><span className="result-label">Coins</span><span className="result-value gold">+{Math.floor(sc*0.5)}</span></div><div className="result-item"><span className="result-label">Streak</span><span className="result-value">{ms}x</span></div><div className="result-item"><span className="result-label">Level</span><span className="result-value">{xp.level}</span></div></div>{xp.level<MAX_LEVEL&&<div className="level-section" style={{marginBottom:24}}><div className="level-header"><span className="level-xp">{xp.current}/{xp.needed} XP</span></div><div className="xp-bar"><div className="xp-fill" style={{width:xp.percent+'%'}}></div></div></div>}{raceMode&&raceTimes.length>0&&<div className="review-section"><h3 className="review-title">Race vs {raceData?.creator||'Challenger'}</h3><div className="race-results">{raceTimes.map((rt,i)=>(<div key={i} className="race-item"><span className="race-q">{rt.question}</span><span className={`race-time ${rt.correct?'correct':'wrong'}`}>{rt.time.toFixed(1)}s</span><span className="race-status">{rt.correct?'\u2713':'\u2717'}</span></div>))}<div className="race-total"><span>Total</span><span>{raceTimes.reduce((a,b)=>a+b.time,0).toFixed(1)}s</span></div></div></div>}{wrongs.length>0&&<div className="review-section"><h3 className="review-title">Missed ({wrongs.length})</h3><div className="review-list">{wrongs.map((w,i)=>(<div key={i} className="review-item"><div className="review-meta"><span className="review-lang">{w.q.l}</span><span className="review-name">{w.q.t}</span><span className="review-cat">{w.q.cat}</span></div><div className="review-code">{w.q.c.map((l,j)=><div key={j} className={j===w.q.b?'review-bug-line':'review-line'}><span className="review-line-num">{j+1}</span><code>{hl(l, w.q.l)}</code></div>)}</div><div className="review-explain"><span className="review-bug-label">Bug:</span> {w.q.e}</div><div className="review-detail">{w.q.exp}</div></div>))}</div></div>}<div className="game-over-actions"><button className="btn-main" onClick={()=>{setRaceMode(false);setRaceData(null);sg2(df,md,cat)}}>{raceMode?'New Race':'Again'}</button><button className="btn-ghost" onClick={()=>{setRaceMode(false);setRaceData(null);setSt('menu')}}>Menu</button></div></div></div>)}

  if(!cq)return(<div className="app minimal"><div className="center-content"><div className="brand">W<span className="dot">.</span></div><button className="btn-main" onClick={()=>setSt('menu')}>Menu</button></div></div>)

  return(<div className="app minimal">
    <header className="game-bar">
      <div className="bar-left"><span className="brand tiny">W<span className="dot">.</span></span><span className="diff-badge">{df}</span>{cat!=='all'&&<span className="cat-badge">{cat}</span>}<span className="level-badge small">Lv {getLevel(st2.totalScore)}</span></div>
      <div className="bar-center"><div className="hud-item score-hud"><span className="hud-label">pts</span><span className="hud-value">{sc}</span>{scoreAnims.map(a=><span key={a.id} className="score-fly">+{a.val}</span>)}</div><div className="hud-item"><span className="hud-label">str</span><span className="hud-value">{sk}x</span></div><div className="hud-item lives">{[0,1,2,3,4].map(i=><span key={i} className={`heart ${i<lv?'full':'empty'}`}>{i<lv?'♥':'♡'}</span>)}</div></div>
      <div className="bar-right"><div className="hud-item"><span className="hud-label">◇</span><span className="hud-value gold">{cn}</span></div><div className={`hud-item timer ${tl<=5?'critical':tl<=10?'warning':''}`}><span className="hud-value">{tl}</span></div><span className="progress">{ix+1}/{qs.length}</span></div>
    </header>
    {(sh2||sf2||db2)&&<div className="active-effects">{sh2&&<span className="effect-tag">Shield</span>}{sf2&&<span className="effect-tag">Safe</span>}{db2&&<span className="effect-tag">2x</span>}</div>}
    {!dn&&Object.entries(iv).filter(([,v])=>v>0).slice(0,5).map(([id,v])=>{const item=ST.find(x=>x.id===id);return item?<button key={id} className="quick-btn" onClick={()=>ui(id)}>{item.i}<span className="quick-qty">{v}</span></button>:null})}
    <main className="challenge-area">
      <div className="challenge-meta"><span className="lang-tag">{cq.l}</span><span className="challenge-title">{cq.t}</span><span className="pts-tag">+{cq.p}</span><button className="bookmark-btn" onClick={()=>tb(cq)}>{bm.some(b=>b.t===cq.t)?'★':'☆'}</button></div>
      <div className="code-block">{cq.c.map((line,i)=>(<div key={i} className={`line ${sl===i?'selected':''} ${dn&&i===cq.b?'correct':''} ${dn&&sl===i&&i!==cq.b?'wrong':''} ${hl2===i?'highlighted':''}`} onClick={()=>{if(!dn){pl('ok');setSl(i)}}}><span className="line-num">{i+1}</span><code>{hl(line, cq.l)}</code></div>))}</div>
      {!dn&&<div className="action-row"><button className="btn-hint-minimal" onClick={()=>{pl('ok');setHi(true)}} disabled={hi}>{hi?'shown':'hint'}</button><button className="btn-submit" onClick={sb} disabled={sl===null}>submit</button></div>}
      {hi&&!dn&&<div className="hint-box">{cq.h}</div>}
      {dn&&<div className={`result-box ${sl===cq.b?'success':'fail'}`}><div className="result-status">{sl===cq.b?'Correct':tl===0?'Time Up':'Wrong'}</div><p className="result-explain">{cq.e}</p><div className="explanation-box"><h4>Why?</h4><p className="detailed-explanation">{cq.exp}</p><span className="category-tag">{cq.cat}</span></div><button className="btn-submit" onClick={hn}>{lv<=0||ix+1>=qs.length?'results':'next'}</button></div>}
    </main>
    {nt&&<div className={`toast ${nt.t}`}>{nt.m}</div>}
    {levelUp&&<div className="levelup-overlay" onClick={()=>setLevelUp(null)}><div className="levelup-modal"><div className="levelup-sparkles">✦</div><div className="levelup-content"><span className="levelup-label">Level Up!</span><span className="levelup-number">{levelUp}</span><span className="levelup-subtitle">You're getting better</span></div><div className="levelup-sparkles">✦</div></div></div>}
  </div>)
}
