"""OpenAI-compatible embeddings using the platform-wide embedding route."""
import hashlib
import json
import math
from fastapi import HTTPException
from astraverse.modules.models import router as models


def target():
    config,targets=models.get_targets('embedding',models.load_settings(models.CONFIG_PATH))
    provider,model=targets[0]
    fingerprint=hashlib.sha256(json.dumps([provider.id,provider.base_url,model]).encode()).hexdigest()[:24]
    return config,provider,model,fingerprint


async def embed(texts,selected=None):
    if not texts or len(texts)>10:raise ValueError('每批向量输入1–10条')
    config,provider,model,fingerprint=selected or target()
    data=await models.request_json(provider,'/embeddings',{'model':model,'input':texts,'encoding_format':'float'},config.timeout)
    rows=sorted(data.get('data',[]),key=lambda r:r.get('index',-1))
    if len(rows)!=len(texts) or [r.get('index') for r in rows]!=list(range(len(texts))):raise ValueError('向量模型返回的数量或顺序无效')
    vectors=[r.get('embedding') for r in rows]
    dimension=len(vectors[0]) if isinstance(vectors[0],list) else 0
    if not 1<=dimension<=8192:raise ValueError('向量维度无效')
    for vector in vectors:
        if not isinstance(vector,list) or len(vector)!=dimension or any(type(v) not in (int,float) or not math.isfinite(v) for v in vector) or not any(vector):raise ValueError('向量模型返回了无效数值')
    return vectors,fingerprint
