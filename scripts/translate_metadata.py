"""Offline, key-free English → Simplified Chinese; no remote inference API."""
import hashlib,json,re,os
MODEL='Helsinki-NLP/opus-mt-en-zh'
def signature(i):return hashlib.sha256(('translation-v2\n'+i['title']+'\n'+i['excerpt']).encode()).hexdigest()
def han(t):return bool(re.search(r'[\u4e00-\u9fff]',t or ''))
def usable(t,title=False):
    if not han(t) or (title and len(t)>110):return False
    if re.search(r'(.{2,10})(?:[，,、 :：]*\1){3,}',t):return False
    chars=re.findall(r'[A-Za-z]',t)
    return len(chars)/max(1,len(t))<.45
def localize(items,previous,root):
    from opencc import OpenCC
    cc=OpenCC('t2s');known={i['id']:i for i in previous.get('items',[])}
    path=root/'translations.json';manual=json.loads(path.read_text()) if path.exists() else {};pending=[]
    for i in items:
        sig=signature(i);old=known.get(i['id'],{});edited=manual.get(i['id']) or manual.get(i['title'])
        if edited:i.update({**edited,'translationBasis':edited.get('translationBasis','依据来源简介的中文编辑介绍'),'translationSignature':sig})
        elif i.get('language')=='ZH' or (han(i['title']) and han(i['excerpt'])):i.update(titleZh=cc.convert(i['title']),excerptZh=cc.convert(i['excerpt']),translationBasis=i.get('excerptBasis','中文来源介绍'),translationSignature=sig)
        elif old.get('translationSignature')==sig and old.get('titleZh'):i.update({k:old[k] for k in ('titleZh','excerptZh','translationBasis','translationSignature')})
        else:pending.append(i)
    if pending:
        import torch
        from transformers import MarianMTModel,MarianTokenizer
        torch.set_num_threads(min(4,os.cpu_count() or 2))
        tokenizer=MarianTokenizer.from_pretrained(MODEL);model=MarianMTModel.from_pretrained(MODEL);model.eval()
        for index,i in enumerate(pending):
            translated=[]
            for index_field,raw in enumerate([i['title'],i['excerpt']]):
                if han(raw):translated.append(cc.convert(raw));continue
                tokens=tokenizer('>>cmn_Hans<< '+raw,return_tensors='pt',truncation=True,max_length=384)
                with torch.inference_mode():result=model.generate(**tokens,max_new_tokens=100 if index_field==0 else 240,num_beams=4,no_repeat_ngram_size=4,repetition_penalty=1.08)
                translated.append(cc.convert(tokenizer.decode(result[0],skip_special_tokens=True)).strip())
            if usable(translated[0],True) and usable(translated[1]):i.update(titleZh=translated[0],excerptZh=translated[1],translationBasis='标题机器翻译；'+i['excerptBasis'] if han(i['excerpt']) else '来源简介机器翻译，仅供初筛',translationSignature=signature(i))
            else:
                for k in ['titleZh','excerptZh','translationSignature']:i.pop(k,None)
            print(f'中文初筛 {index+1}/{len(pending)}',flush=True)
    return items
