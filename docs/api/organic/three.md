# three

## Classes

### PoseInertializer

Call `capture()` at a transition, then `apply(dt, halflife)` every frame
after the new pose has been written to the bones.

#### Constructors

##### Constructor

```ts
new PoseInertializer(bones, opts?): PoseInertializer;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `bones` | ( \| `Object3D`\<`Object3DEventMap`\> \| `Bone`\<`Object3DEventMap`\> \| `null` \| `undefined`)[] |
| `opts?` | [`PoseInertializerOptions`](#poseinertializeroptions) |

###### Returns

[`PoseInertializer`](#poseinertializer)

#### Accessors

##### active

###### Get Signature

```ts
get active(): boolean;
```

###### Returns

`boolean`

#### Methods

##### apply()

```ts
apply(dt, halflife): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `halflife` | `number` |

###### Returns

`void`

##### capture()

```ts
capture(): void;
```

###### Returns

`void`

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

## Interfaces

### PoseInertializerOptions

Options of `PoseInertializer`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fast"></a> `fast?` | `boolean` | Use the fast exp approximation. Default false. |
| <a id="property-positions"></a> `positions?` | `Object3D`\<`Object3DEventMap`\>[] | Objects whose `position` is inertialized too, such as the hips or root. |
