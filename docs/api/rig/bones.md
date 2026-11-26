# bones

## Type Aliases

### HumanBone

```ts
type HumanBone = typeof HUMAN_BONES[number];
```

One VRM 1.0 humanoid bone name.

## Variables

### HUMAN\_BONES

```ts
const HUMAN_BONES: readonly ["hips", "spine", "chest", "upperChest", "neck", "head", "leftEye", "rightEye", "jaw", "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes", "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes", "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand", "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand", "leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal", "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal", "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal", "leftRingProximal", "leftRingIntermediate", "leftRingDistal", "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal", "rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal", "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal", "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal", "rightRingProximal", "rightRingIntermediate", "rightRingDistal", "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal"];
```

The VRM 1.0 humanoid bone names, in the order the wasm core numbers them.

***

### REQUIRED\_BONES

```ts
const REQUIRED_BONES: readonly HumanBone[];
```

The 15 bones VRM 1.0 requires.

## Functions

### boneIndex()

```ts
function boneIndex(b): number;
```

The index of a bone in `HUMAN_BONES`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | \| `"hips"` \| `"spine"` \| `"chest"` \| `"upperChest"` \| `"neck"` \| `"head"` \| `"leftEye"` \| `"rightEye"` \| `"jaw"` \| `"leftUpperLeg"` \| `"leftLowerLeg"` \| `"leftFoot"` \| `"leftToes"` \| `"rightUpperLeg"` \| `"rightLowerLeg"` \| `"rightFoot"` \| `"rightToes"` \| `"leftShoulder"` \| `"leftUpperArm"` \| `"leftLowerArm"` \| `"leftHand"` \| `"rightShoulder"` \| `"rightUpperArm"` \| `"rightLowerArm"` \| `"rightHand"` \| `"leftThumbMetacarpal"` \| `"leftThumbProximal"` \| `"leftThumbDistal"` \| `"leftIndexProximal"` \| `"leftIndexIntermediate"` \| `"leftIndexDistal"` \| `"leftMiddleProximal"` \| `"leftMiddleIntermediate"` \| `"leftMiddleDistal"` \| `"leftRingProximal"` \| `"leftRingIntermediate"` \| `"leftRingDistal"` \| `"leftLittleProximal"` \| `"leftLittleIntermediate"` \| `"leftLittleDistal"` \| `"rightThumbMetacarpal"` \| `"rightThumbProximal"` \| `"rightThumbDistal"` \| `"rightIndexProximal"` \| `"rightIndexIntermediate"` \| `"rightIndexDistal"` \| `"rightMiddleProximal"` \| `"rightMiddleIntermediate"` \| `"rightMiddleDistal"` \| `"rightRingProximal"` \| `"rightRingIntermediate"` \| `"rightRingDistal"` \| `"rightLittleProximal"` \| `"rightLittleIntermediate"` \| `"rightLittleDistal"` |

#### Returns

`number`

***

### isHumanBone()

```ts
function isHumanBone(s): s is "hips" | "spine" | "chest" | "upperChest" | "neck" | "head" | "leftEye" | "rightEye" | "jaw" | "leftUpperLeg" | "leftLowerLeg" | "leftFoot" | "leftToes" | "rightUpperLeg" | "rightLowerLeg" | "rightFoot" | "rightToes" | "leftShoulder" | "leftUpperArm" | "leftLowerArm" | "leftHand" | "rightShoulder" | "rightUpperArm" | "rightLowerArm" | "rightHand" | "leftThumbMetacarpal" | "leftThumbProximal" | "leftThumbDistal" | "leftIndexProximal" | "leftIndexIntermediate" | "leftIndexDistal" | "leftMiddleProximal" | "leftMiddleIntermediate" | "leftMiddleDistal" | "leftRingProximal" | "leftRingIntermediate" | "leftRingDistal" | "leftLittleProximal" | "leftLittleIntermediate" | "leftLittleDistal" | "rightThumbMetacarpal" | "rightThumbProximal" | "rightThumbDistal" | "rightIndexProximal" | "rightIndexIntermediate" | "rightIndexDistal" | "rightMiddleProximal" | "rightMiddleIntermediate" | "rightMiddleDistal" | "rightRingProximal" | "rightRingIntermediate" | "rightRingDistal" | "rightLittleProximal" | "rightLittleIntermediate" | "rightLittleDistal";
```

True when a string is a VRM 1.0 humanoid bone name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

s is "hips" \| "spine" \| "chest" \| "upperChest" \| "neck" \| "head" \| "leftEye" \| "rightEye" \| "jaw" \| "leftUpperLeg" \| "leftLowerLeg" \| "leftFoot" \| "leftToes" \| "rightUpperLeg" \| "rightLowerLeg" \| "rightFoot" \| "rightToes" \| "leftShoulder" \| "leftUpperArm" \| "leftLowerArm" \| "leftHand" \| "rightShoulder" \| "rightUpperArm" \| "rightLowerArm" \| "rightHand" \| "leftThumbMetacarpal" \| "leftThumbProximal" \| "leftThumbDistal" \| "leftIndexProximal" \| "leftIndexIntermediate" \| "leftIndexDistal" \| "leftMiddleProximal" \| "leftMiddleIntermediate" \| "leftMiddleDistal" \| "leftRingProximal" \| "leftRingIntermediate" \| "leftRingDistal" \| "leftLittleProximal" \| "leftLittleIntermediate" \| "leftLittleDistal" \| "rightThumbMetacarpal" \| "rightThumbProximal" \| "rightThumbDistal" \| "rightIndexProximal" \| "rightIndexIntermediate" \| "rightIndexDistal" \| "rightMiddleProximal" \| "rightMiddleIntermediate" \| "rightMiddleDistal" \| "rightRingProximal" \| "rightRingIntermediate" \| "rightRingDistal" \| "rightLittleProximal" \| "rightLittleIntermediate" \| "rightLittleDistal"
