import { forwardRef } from "react";
import type { Group } from "three";
export default forwardRef<Group>(function Headphones(_,ref) {
  return <group ref={ref} name="character-headphones">
    <mesh position={[0,.19,0]}><torusGeometry args={[.3,.034,10,36,Math.PI]}/><meshStandardMaterial color="#24334d" roughness={.45}/></mesh>
    {[-1,1].map(side=><group key={side} position={[side*.29,.17,0]}>
      <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.105,.105,.075,20]}/><meshStandardMaterial color="#25334a" roughness={.4}/></mesh>
      <mesh position={[side*.045,0,0]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.073,.012,8,24]}/><meshStandardMaterial color="#8edbd2" emissive="#4bafa7" emissiveIntensity={.35}/></mesh>
    </group>)}
  </group>;
});
