# Discord Message Components v2

Discord released Components v2 in March 2025, replacing the old
`content` + `embeds[]` + `components[]` model with a unified component tree.

## The Key Change

Set the `IS_COMPONENTS_V2` flag (`1 << 15` = `32768`) on message flags. When set,
`content`, `embeds`, and `sticker_ids` are **ignored** — the `components[]` array
IS the entire message.

## New Component Types

| Type             | ID | Top-level? | What it does                                    |
| ---------------- | -- | ---------- | ----------------------------------------------- |
| Action Row       | 1  | Yes        | Container for buttons/selects (unchanged)       |
| **Section**      | 9  | Yes        | 1-3 TextDisplays + optional accessory (thumb/btn) |
| **Text Display** | 10 | Yes        | Markdown text block                             |
| **Thumbnail**    | 11 | No         | Small image, Section accessory only             |
| **Media Gallery**| 12 | Yes        | Grid of up to 10 media items                    |
| **File**         | 13 | Yes        | File attachment display                         |
| **Separator**    | 14 | Yes        | Divider line with spacing control               |
| **Container**    | 17 | Yes        | Grouping wrapper with colored accent border     |

Buttons (2) and Select Menus (3-8) are unchanged and still live in Action Rows.

## Component Hierarchy

```
Message (flags: 32768)
└── components[] (max 10 top-level)
    ├── TextDisplay { content: "markdown" }
    ├── Section { components: [TextDisplay, ...], accessory?: Thumbnail | Button }
    ├── MediaGallery { items: [{ media: { url }, description?, spoiler? }] }
    ├── File { file: { url } }
    ├── Separator { divider: bool, spacing: 1|2 }
    ├── ActionRow { components: [Button | Select] }
    └── Container { accent_color: int, spoiler: bool, components: [...] }
        └── (anything above EXCEPT another Container, max 10)
```

## What Replaces What

| Old pattern              | Components v2 equivalent              |
| ------------------------ | ------------------------------------- |
| `content` text           | TextDisplay                           |
| Embed description/fields | TextDisplay inside Container          |
| Embed color sidebar      | Container `accent_color`              |
| Embed thumbnail          | Section with Thumbnail accessory      |
| Embed image              | MediaGallery                          |
| Embed author             | Section with TextDisplay + Thumbnail  |
| Multiple embeds          | Multiple Containers                   |
| No dividers possible     | Separator                             |

## Key Constraints

- Max 10 top-level components per message
- Max 10 components inside a Container
- Max 5 Action Rows (unchanged)
- Max 5 buttons per Action Row (unchanged)
- 1 select menu per Action Row (unchanged)
- Containers **cannot** nest inside Containers
- Sections hold 1-3 TextDisplays
- A single Button can be a Section accessory (outside an ActionRow — new)
- MediaGallery holds up to 10 items

## Practical Example

```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "accent_color": 5793266,
      "components": [
        {
          "type": 9,
          "components": [
            { "type": 10, "content": "**Username**" },
            { "type": 10, "content": "3 reports across 2 channels" }
          ],
          "accessory": {
            "type": 11,
            "media": { "url": "https://cdn.discordapp.com/avatars/..." }
          }
        },
        { "type": 14, "divider": true, "spacing": 1 },
        { "type": 10, "content": "Reasons: Spam ×2, Harassment ×1" },
        {
          "type": 1,
          "components": [
            { "type": 2, "style": 4, "label": "Ban", "custom_id": "ban|123" }
          ]
        }
      ]
    }
  ]
}
```

## discord.js Support

As of discord.js v14.x, Components v2 support should be available through the
raw API message options. The `MessageFlags.IsComponentsV2` flag may need to be
set manually. Builder classes may not yet exist for all new types — we may need
to construct raw component objects.

Check discord.js changelog/docs for builder support before implementing.
