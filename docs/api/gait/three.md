# three

## Interfaces

### DriveExtras

Optional tail, ear and IK settings for `driveQuadruped`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-ears"></a> `ears?` | \[`number`, `number`\] | Ear angles, from `Ears`. |
| <a id="property-ik"></a> `ik?` | `boolean` | Leg IK on or off. Default on. |
| <a id="property-tail"></a> `tail?` | `object` | Tail link yaw angles and the root link lift, from `TailWag`. |
| `tail.lift` | `number` | - |
| `tail.yaw` | `number`[] | - |

***

### LegNames

Bone names of one leg: upper, middle and end joints, then the toe bones.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end"></a> `end` | `string` | - |
| <a id="property-mid"></a> `mid` | `string` | - |
| <a id="property-toes"></a> `toes` | `string`[] | Bones from the end joint down to the toe tip. |
| <a id="property-up"></a> `up` | `string` | - |

***

### QuadrupedNames

Bone names of a quadruped: the four legs, the hips, and optional spine, tail and ear bones.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-ears-1"></a> `ears?` | \[`string`, `string`\] | - |
| <a id="property-hips"></a> `hips` | `string` | The bone that carries the body's pitch, roll and drop. |
| <a id="property-legs"></a> `legs` | `object` | - |
| `legs.LF` | [`LegNames`](#legnames) | - |
| `legs.LH` | [`LegNames`](#legnames) | - |
| `legs.RF` | [`LegNames`](#legnames) | - |
| `legs.RH` | [`LegNames`](#legnames) | - |
| <a id="property-spine"></a> `spine?` | `string`[] | - |
| <a id="property-tail-1"></a> `tail?` | `string`[] | - |

***

### QuadrupedRig

A quadruped rig measured from its rest pose by `measureQuadruped`, ready for `driveQuadruped`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-ears-2"></a> `ears` | `Object3D`\<`Object3DEventMap`\>[] |
| <a id="property-geometry"></a> `geometry` | [`BodyGeometry`](index.md#bodygeometry) |
| <a id="property-hips-1"></a> `hips` | `Object3D` |
| <a id="property-leglength"></a> `legLength` | `number` |
| <a id="property-legs-1"></a> `legs` | `MeasuredLeg`[] |
| <a id="property-rest"></a> `rest` | `Map`\<`Object3D`\<`Object3DEventMap`\>, \{ `p`: `Vector3`; `q`: `Quaternion`; `s`: `Vector3`; \}\> |
| <a id="property-root"></a> `root` | `Object3D` |
| <a id="property-specs"></a> `specs` | [`LegSpec`](index.md#legspec)[] |
| <a id="property-spine-1"></a> `spine` | `Object3D`\<`Object3DEventMap`\>[] |
| <a id="property-tail-2"></a> `tail` | `Object3D`\<`Object3DEventMap`\>[] |

## Functions

### driveQuadruped()

```ts
function driveQuadruped(
   rig, 
   pose, 
   gait, 
   body, 
   extras?
): number[];
```

Writes one frame of gait and body state onto the rig. Returns the legs whose target was out of reach.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rig` | [`QuadrupedRig`](#quadrupedrig) |
| `pose` | \{ `x`: `number`; `yaw`: `number`; `z`: `number`; \} |
| `pose.x` | `number` |
| `pose.yaw` | `number` |
| `pose.z` | `number` |
| `gait` | [`GaitState`](index.md#gaitstate) |
| `body` | [`BodyPose`](index.md#bodypose) |
| `extras?` | [`DriveExtras`](#driveextras) |

#### Returns

`number`[]

***

### measureQuadruped()

```ts
function measureQuadruped(root, names): QuadrupedRig;
```

Measures leg spots, toe heights, leg length and track width from the rest
pose. `root` must sit at the origin with identity rotation and face +Z
when this runs. Names can come from `@hackbuild/rig` `limbChains`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |
| `names` | [`QuadrupedNames`](#quadrupednames) |

#### Returns

[`QuadrupedRig`](#quadrupedrig)
