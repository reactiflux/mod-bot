import { Form } from "react-router";

import type { GuildRole, ProcessedChannel } from "#~/helpers/guildData.server";

export function GuildSettingsForm({
  guildId,
  roles,
  channels,
  buttonText = "Complete Setup",
  defaultValues,
}: {
  guildId: string;
  roles: GuildRole[];
  channels: ProcessedChannel[];
  buttonText?: string;
  defaultValues?: {
    moderatorRole?: string;
    modLogChannel?: string;
    restrictedRole?: string;
  };
}) {
  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="guild_id" value={guildId} />

      <div>
        <label
          htmlFor="moderator_role"
          className="block text-sm font-medium text-gray-700"
        >
          Moderator Role <span className="text-red-500">*</span>
        </label>
        <div className="mt-1">
          <select
            id="moderator_role"
            name="moderator_role"
            required
            defaultValue={defaultValues?.moderatorRole ?? ""}
            className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-black shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Select a role...</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
                {role.color !== 0 && (
                  <span
                    style={{
                      color: `#${role.color.toString(16).padStart(6, "0")}`,
                    }}
                  >
                    {" "}
                    ●
                  </span>
                )}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          The role that grants moderator permissions to users.
        </p>
      </div>

      <div>
        <label
          htmlFor="mod_log_channel"
          className="block text-sm font-medium text-gray-700"
        >
          Mod Log Channel <span className="text-red-500">*</span>
        </label>
        <div className="mt-1">
          <select
            id="mod_log_channel"
            name="mod_log_channel"
            required
            defaultValue={defaultValues?.modLogChannel ?? ""}
            className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-black shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Select a channel...</option>
            {channels.map((item) => {
              if (item.type === "channel") {
                return (
                  <option key={item.data.id} value={item.data.id}>
                    #{item.data.name}
                  </option>
                );
              } else if (item.children && item.children.length > 0) {
                return (
                  <optgroup
                    key={item.data.id}
                    label={item.data.name.toUpperCase()}
                  >
                    {item.children.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                  </optgroup>
                );
              }
              return null;
            })}
          </select>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          The channel where moderation reports will be sent.
        </p>
      </div>

      <div>
        <label
          htmlFor="restricted_role"
          className="block text-sm font-medium text-gray-700"
        >
          Restricted Role (Optional)
        </label>
        <div className="mt-1">
          <select
            id="restricted_role"
            name="restricted_role"
            defaultValue={defaultValues?.restrictedRole ?? ""}
            className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-black shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Select a role...</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
                {role.color !== 0 && (
                  <span
                    style={{
                      color: `#${role.color.toString(16).padStart(6, "0")}`,
                    }}
                  >
                    {" "}
                    ●
                  </span>
                )}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          A role that prevents members from accessing some channels during
          timeouts.
        </p>
      </div>

      {(roles.length === 0 || channels.length === 0) && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Unable to load server data
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  We couldn't fetch your server's roles and channels. Make sure
                  Euno has proper permissions in your server.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <button
          type="submit"
          className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {buttonText}
        </button>
      </div>
    </Form>
  );
}
