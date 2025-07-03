# Discord Permissions Calculation - 2025-06-28

## Required Bot Permissions

Instead of Administrator (8), we need specific permissions:

### Core Moderation (116294643952)

- ViewChannels (1024)
- SendMessages (2048)
- ManageMessages (8192)
- ReadMessageHistory (65536)
- ModerateMembers (1099511627776) // timeout/ban

### Role & Channel Management (268435456)

- ManageRoles (268435456)
- ManageChannels (16)

### Threads for Tickets (17179869184)

- CreatePublicThreads (34359738368)
- CreatePrivateThreads (68719476736)
- ManageThreads (17179869184)

### Combined: 385929748752

- All permissions needed for full bot functionality

## Permission Values Used

- Basic functionality: 268435456 (ManageRoles + basic message perms)
- Full functionality: 385929748752 (all permissions)

The OAuth flow uses the basic set initially, with option to request more later.
