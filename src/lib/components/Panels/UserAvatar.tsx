import React from "react";
import { Avatar } from "@chakra-ui/react";
import { UserIcon } from "@phosphor-icons/react";
import { AVATAR_SQUIRCLE_RADIUS, getAvatarPalette } from "./avatarPalette";

type AvatarRootProps = React.ComponentProps<typeof Avatar.Root>;

export type UserAvatarProps = Omit<AvatarRootProps, "children"> & {
  /** Display name; drives both the initials and the colour. */
  name?: string;
};

/**
 * Mirror of the app's `components/UserAvatar`: a squircle with a light
 * `{palette}.subtle` fill and a dark `{palette}.fg` glyph, the hue hashed
 * from the displayed name. Keep the two in step.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({ name, ...rest }) => (
  <Avatar.Root
    colorPalette={getAvatarPalette(name)}
    bg="colorPalette.subtle"
    color="colorPalette.fg"
    borderRadius={AVATAR_SQUIRCLE_RADIUS}
    overflow="hidden"
    {...rest}
  >
    {/* Chakra gives the fallback its own 9999px radius; inherit the root's. */}
    <Avatar.Fallback name={name} borderRadius="inherit">
      {name ? undefined : <UserIcon weight="bold" />}
    </Avatar.Fallback>
  </Avatar.Root>
);

export default UserAvatar;
