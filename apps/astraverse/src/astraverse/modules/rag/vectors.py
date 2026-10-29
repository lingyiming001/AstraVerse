"""Replaceable vector adapter. Local Qdrant for a single API worker; no source text payloads."""
from pathlib import Path
from threading import RLock
from astraverse.modules.agents import profiles
_clients={}
lock=RLock()


def path():return Path(profiles.MEMORY).with_suffix('.rag-vectors')


def client():
    from qdrant_client import QdrantClient
    key=str(path())
    if key not in _clients:_clients[key]=QdrantClient(path=key)
    return _clients[key]


def collection(fingerprint,dimension):return 'rag_'+fingerprint+'_'+str(dimension)


def upsert(fingerprint,doc_id,generation,rows,vectors):
    from qdrant_client import models
    with lock:
        c=client();name=collection(fingerprint,len(vectors[0]))
        if not c.collection_exists(name):c.create_collection(name,vectors_config=models.VectorParams(size=len(vectors[0]),distance=models.Distance.COSINE))
        c.upsert(name,points=[models.PointStruct(id=row['id'],vector=vector,payload={'document':doc_id,'generation':generation,'access_key':doc_id+'|'+generation}) for row,vector in zip(rows,vectors)],wait=True)


def search(fingerprint,vector,allowed,threshold):
    from qdrant_client import models
    with lock:
        if not path().exists():return []
        c=client();name=collection(fingerprint,len(vector))
        if not c.collection_exists(name):return []
        keys=[doc['id']+'|'+doc['generation'] for doc in allowed.values()]
        if not keys:return []
        result=c.query_points(name,query=vector,query_filter=models.Filter(must=[models.FieldCondition(key='access_key',match=models.MatchAny(any=keys))]),limit=40,score_threshold=threshold,with_payload=False)
        return [(str(point.id),point.score) for point in result.points]


def delete(doc_id,generation=None):
    if not path().exists():return
    from qdrant_client import models
    with lock:
        if not path().exists():return
        c=client();conditions=[models.FieldCondition(key='document',match=models.MatchValue(value=doc_id))]
        if generation:conditions.append(models.FieldCondition(key='generation',match=models.MatchValue(value=generation)))
        for entry in c.get_collections().collections:
            c.delete(entry.name,points_selector=models.FilterSelector(filter=models.Filter(must=conditions)),wait=True)
