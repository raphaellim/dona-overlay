'use strict';
function inspect(b){
 const fail=()=>{throw Error('읽을 수 없는 GIF 파일입니다');};if(b.length>15*1024*1024)throw Error('GIF는 15MB 이하로 올려주세요');if(b.length<14||!['GIF87a','GIF89a'].includes(b.subarray(0,6).toString('ascii')))fail();const width=b.readUInt16LE(6),height=b.readUInt16LE(8);if(!width||!height||width>960||height>540)throw Error('GIF는 960×540px 이하로 올려주세요');let at=13,frames=0,delay=10,minDelay=Infinity,duration=0;
 const skip=n=>{if(at+n>b.length)fail();at+=n;};const blocks=()=>{for(;;){if(at>=b.length)fail();const n=b[at++];if(!n)return;skip(n);}};
 if(b[10]&128)skip(3*(1<<((b[10]&7)+1)));
 for(;;){if(at>=b.length)fail();const kind=b[at++];if(kind===0x3b){if(!frames)fail();break;}if(kind===0x21){if(at>=b.length)fail();const label=b[at++];if(label===0xf9){if(at+6>b.length||b[at]!==4||b[at+5]!==0)fail();delay=b.readUInt16LE(at+2)||10;at+=6;}else blocks();}else if(kind===0x2c){if(at+9>b.length)fail();const left=b.readUInt16LE(at),top=b.readUInt16LE(at+2),w=b.readUInt16LE(at+4),h=b.readUInt16LE(at+6),packed=b[at+8];if(!w||!h||left+w>width||top+h>height)fail();at+=9;if(packed&128)skip(3*(1<<((packed&7)+1)));if(at>=b.length||b[at]<2||b[at]>8)fail();at++;blocks();frames++;duration+=delay;minDelay=Math.min(minDelay,delay);delay=10;if(frames>450)throw Error('GIF 프레임이 너무 많습니다. 450프레임 이하로 줄이세요');if(width*height*frames>64000000)throw Error('GIF가 너무 큽니다. 해상도나 프레임 수를 줄여주세요');}else fail();}
 if(frames>1&&minDelay<3)throw Error('GIF는 초당 30프레임 정도 이하로 줄여주세요');return {width,height,frames,duration:duration/100};
}
module.exports={inspect};
