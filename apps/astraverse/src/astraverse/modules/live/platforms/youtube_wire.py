"""Minimal wire-compatible schema for YouTube's official StreamList RPC.

Field numbers follow Google's published stream_list.proto (Apache 2.0):
https://developers.google.com/youtube/data/live/streaming-live-chat
Only text chat fields are represented; Protobuf retains/ignores unknown event fields.
This module constructs descriptors so runtime installation needs no code generator.
"""
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

schema=descriptor_pb2.FileDescriptorProto(name='astraverse_youtube_chat.proto',package='astraverse.youtube',syntax='proto2')

def define(name,fields):
    message=schema.message_type.add(name=name)
    for field_name,number,kind,repeated in fields:
        field=message.field.add(name=field_name,number=number,label=3 if repeated else 1)
        if isinstance(kind,str):field.type=11;field.type_name='.astraverse.youtube.'+kind
        else:field.type=kind

# Protobuf wire types: string=9, uint32=13, int32=5, nested message=11.
define('Request',[('chat',1,9,False),('cursor',99,9,False),('parts',100,9,True)])
define('Text',[('content',1,9,False)])
define('Snippet',[('event_type',1,5,False),('published',4,9,False),('text',19,'Text',False)])
define('Author',[('channel',10101,9,False),('name',103,9,False)])
define('Message',[('id',101,9,False),('snippet',2,'Snippet',False),('author',3,'Author',False)])
define('Response',[('ended',2,9,False),('cursor',100602,9,False),('messages',1007,'Message',True)])
pool=descriptor_pool.DescriptorPool();pool.Add(schema)
Request=message_factory.GetMessageClass(pool.FindMessageTypeByName('astraverse.youtube.Request'))
Response=message_factory.GetMessageClass(pool.FindMessageTypeByName('astraverse.youtube.Response'))


def payload(response):
    return {'offlineAt':response.ended,'nextPageToken':response.cursor,'items':[
        {'id':message.id,
         'snippet':{'type':'textMessageEvent' if message.snippet.event_type==1 else 'chatEndedEvent' if message.snippet.event_type==4 else 'other',
                    'publishedAt':message.snippet.published,'textMessageDetails':{'messageText':message.snippet.text.content}},
         'authorDetails':{'channelId':message.author.channel,'displayName':message.author.name}}
        for message in response.messages]}
