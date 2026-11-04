import React from 'react';
import {
  FiAlertTriangle,
  FiActivity,
  FiClock,
  FiShield,
  FiTerminal,
  FiCornerDownLeft,
} from 'react-icons/fi';

/**
 * Phase 161: `import * as FiIcons from 'react-icons/fi'` forced the whole
 * Feather barrel into the client bundle. A namespace import read through a
 * computed key (`FiIcons[`Fi${name}`]`) cannot be tree-shaken, so every icon
 * shipped whether a screen used it or not.
 *
 * The `name` prop is only ever called with the handful of names below, so they
 * are registered explicitly. Rollup can now drop the rest of the set.
 */
const ICON_REGISTRY = {
  Activity: FiActivity,
  Clock: FiClock,
  Shield: FiShield,
  Terminal: FiTerminal,
  CornerDownLeft: FiCornerDownLeft,
  AlertTriangle: FiAlertTriangle,
};

const SafeIcon = ({ icon, name, ...props }) => {
  const IconComponent = icon || (name ? ICON_REGISTRY[name] : null) || FiAlertTriangle;

  return React.createElement(IconComponent, props);
};

export default SafeIcon;
