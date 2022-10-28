import { calculateChangedCommands, compareCommands } from "./discordCommands";

import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";

const l = {
  slashCommand: new SlashCommandBuilder()
    .setName("slash-demo")
    .setDescription("slash description"),
  userCommand: new ContextMenuCommandBuilder()
    .setName("user demo")
    .setType(ApplicationCommandType.User),
  messageCommand: new ContextMenuCommandBuilder()
    .setName("message demo")
    .setType(ApplicationCommandType.Message),
};

const r = {
  slashCommand: {
    id: "100000000000000000",
    name: "slash-demo",
    description: "slash description",
    application_id: "000000000000000001",
    version: "000010000000000000",
    guild_id: undefined,
    default_member_permissions: null,
    type: ApplicationCommandType.ChatInput,
  },
  slashCommandC: {
    id: "100000000000000000",
    name: "slash-demo",
    description: "CHANGED slash description 1234",
    application_id: "000000000000000001",
    version: "000010000000000000",
    guild_id: undefined,
    default_member_permissions: "different",
    type: ApplicationCommandType.ChatInput,
  },
  // with options
  slashCommandO: {
    id: "2000000000000000000",
    name: "slash-with-options",
    description: "",
    application_id: "000000000000000001",
    version: "000010000000000000",
    guild_id: undefined,
    default_member_permissions: null,
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        type: 8,
        name: "option",
        description: "Some description",
        required: true,
      },
    ],
  },
  // with options, changed
  slashCommandOC: {
    id: "2000000000000000000",
    name: "slash-with-options",
    description: "",
    application_id: "000000000000000001",
    version: "000010000000000000",
    guild_id: undefined,
    default_member_permissions: null,
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        type: 8,
        name: "option",
        description: "DIFFERENT",
        required: true,
      },
    ],
  },
  // with options, changed (new option)
  slashCommandOC2: {
    id: "2000000000000000000",
    name: "slash-with-options",
    description: "",
    application_id: "000000000000000001",
    version: "000010000000000000",
    guild_id: undefined,
    default_member_permissions: null,
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        type: 8,
        name: "option",
        description: "Some description",
        required: true,
      },
      {
        type: 8,
        name: "option2",
        description: "Some description",
        required: true,
      },
    ],
  },
  // with options, changed (not req)
  slashCommandOC3: {
    id: "2000000000000000000",
    name: "slash-with-options",
    description: "",
    application_id: "000000000000000001",
    version: "000010000000000000",
    guild_id: undefined,
    default_member_permissions: null,
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        type: 8,
        name: "option",
        description: "Some description",
      },
    ],
  },
  userCommand: {
    id: "300000000000000000",
    name: "user demo",
    description: "",
    guild_id: undefined,
    application_id: "000000000000000001",
    version: "000010000000000000",
    default_member_permissions: null,
    type: ApplicationCommandType.User,
  },
  userCommandC: {
    id: "300000000000000000",
    name: "user demo",
    description: "",
    guild_id: undefined,
    application_id: "000000000000000001",
    version: "000010000000000000",
    default_member_permissions: "changed",
    type: ApplicationCommandType.User,
  },
  userCommandD: {
    id: "400000000000000000",
    name: "DIFFERENT user",
    description: "",
    guild_id: undefined,
    application_id: "000000000000000001",
    version: "000010000000000000",
    default_member_permissions: null,
    type: ApplicationCommandType.User,
  },
  messageCommand: {
    id: "500000000000000000",
    name: "message demo",
    description: "",
    application_id: "000000000000000001",
    guild_id: undefined,
    version: "000010000000000000",
    default_member_permissions: null,
    type: ApplicationCommandType.Message,
  },
  messageCommandC: {
    id: "500000000000000000",
    name: "message demo",
    description: "",
    application_id: "000000000000000001",
    guild_id: undefined,
    version: "000010000000000000",
    default_member_permissions: "changed",
    type: ApplicationCommandType.Message,
  },
  messageCommandD: {
    id: "600000000000000000",
    name: "DIFFERENT message demo",
    description: "",
    application_id: "000000000000000001",
    guild_id: undefined,
    version: "000010000000000000",
    default_member_permissions: null,
    type: ApplicationCommandType.Message,
  },
};

describe("compareCommands", () => {
  it("spots simple differences", () => {
    // local slash commands
    expect(compareCommands(l.slashCommand, r.slashCommand)).toBe(true);
    expect(compareCommands(l.slashCommand, r.slashCommandC)).toBe(false);
    expect(compareCommands(l.slashCommand, r.slashCommandO)).toBe(false);
    expect(compareCommands(l.slashCommand, r.slashCommandOC)).toBe(false);
    expect(compareCommands(l.slashCommand, r.slashCommandOC2)).toBe(false);
    expect(compareCommands(l.slashCommand, r.slashCommandOC3)).toBe(false);
    expect(compareCommands(l.slashCommand, r.messageCommand)).toBe(false);
    expect(compareCommands(l.slashCommand, r.userCommand)).toBe(false);
    expect(compareCommands(l.slashCommand, r.messageCommandD)).toBe(false);
    expect(compareCommands(l.slashCommand, r.userCommandD)).toBe(false);
    // local user commands
    expect(compareCommands(l.userCommand, r.userCommand)).toBe(true);
    expect(compareCommands(l.userCommand, r.userCommandC)).toBe(false);
    expect(compareCommands(l.userCommand, r.userCommandD)).toBe(false);
    expect(compareCommands(l.userCommand, r.slashCommand)).toBe(false);
    expect(compareCommands(l.userCommand, r.slashCommandO)).toBe(false);
    expect(compareCommands(l.userCommand, r.messageCommand)).toBe(false);
    expect(compareCommands(l.userCommand, r.messageCommandD)).toBe(false);
    // local message commands
    expect(compareCommands(l.messageCommand, r.messageCommand)).toBe(true);
    expect(compareCommands(l.messageCommand, r.messageCommandC)).toBe(false);
    expect(compareCommands(l.messageCommand, r.messageCommandD)).toBe(false);
    expect(compareCommands(l.messageCommand, r.slashCommand)).toBe(false);
    expect(compareCommands(l.messageCommand, r.slashCommandO)).toBe(false);
    expect(compareCommands(l.messageCommand, r.userCommand)).toBe(false);
    expect(compareCommands(l.messageCommand, r.userCommandD)).toBe(false);
  });
});

test("calculateChangedCommands", () => {
  expect(
    calculateChangedCommands(
      [l.slashCommand, l.messageCommand, l.userCommand],
      [r.slashCommand, r.messageCommand, r.userCommand],
    ),
  ).toEqual({ toDelete: [], didCommandsChange: false });
  expect(
    calculateChangedCommands(
      [l.slashCommand, l.messageCommand, l.userCommand],
      [r.slashCommandC, r.messageCommand, r.userCommand],
    ),
  ).toEqual({ toDelete: [], didCommandsChange: true });
  expect(
    calculateChangedCommands(
      [l.slashCommand, l.messageCommand, l.userCommand],
      [r.slashCommand, r.messageCommandC, r.userCommand],
    ),
  ).toEqual({ toDelete: [], didCommandsChange: true });
  expect(
    calculateChangedCommands(
      [l.slashCommand, l.messageCommand, l.userCommand],
      [r.slashCommand, r.messageCommand, r.userCommandC],
    ),
  ).toEqual({ toDelete: [], didCommandsChange: true });
  expect(
    calculateChangedCommands(
      [],
      [r.slashCommand, r.messageCommand, r.userCommand],
    ),
  ).toEqual({
    toDelete: [r.slashCommand.id, r.messageCommand.id, r.userCommand.id],
    didCommandsChange: false,
  });
  expect(
    calculateChangedCommands(
      [l.slashCommand, l.messageCommand, l.userCommand],
      [],
    ),
  ).toEqual({
    toDelete: [],
    didCommandsChange: true,
  });
});
