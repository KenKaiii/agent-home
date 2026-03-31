import { memo, useCallback } from 'react';
import { LogBox, Pressable, StyleSheet, Text, View } from 'react-native';

import * as Clipboard from 'expo-clipboard';

import { Copy01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { format } from 'date-fns';
import Markdown, { type RenderRules } from 'react-native-markdown-display';

import { StreamingCursor } from '@/components/StreamingText';
import { colors, fontSize, spacing } from '@/lib/constants';
import { successHaptic } from '@/lib/haptics';
import type { ChatMessage } from '@/types';

// Known library bug — it spreads a key prop into JSX internally
LogBox.ignoreLogs(['A props object containing a "key" prop is being spread into JSX']);

const markdownStyles = StyleSheet.create({
  // Base
  body: { color: colors.text, fontSize: 18 },
  paragraph: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
  },

  // Headings
  heading1: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
  },
  heading2: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
  },
  heading3: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    flexDirection: 'row',
  },
  heading4: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    flexDirection: 'row',
  },
  heading5: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    flexDirection: 'row',
  },
  heading6: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    flexDirection: 'row',
  },

  // Emphasis
  strong: { color: colors.text, fontWeight: 'bold' },
  em: { color: colors.text, fontStyle: 'italic' },
  s: { textDecorationLine: 'line-through', color: colors.textSecondary },

  // Links
  link: { color: colors.accent, textDecorationLine: 'underline' },
  blocklink: { flex: 1, borderColor: colors.border, borderBottomWidth: 1 },

  // Blockquotes
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.md,
    marginLeft: 0,
    marginVertical: spacing.sm,
    backgroundColor: 'transparent',
  },

  // Inline code
  code_inline: {
    backgroundColor: colors.surface,
    color: colors.accent,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: fontSize.md,
  },

  // Code blocks — hide default style since we use a custom rule with a header
  code_block: {
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: fontSize.md,
  },
  fence: {
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: fontSize.md,
  },

  // Lists
  bullet_list: { marginVertical: spacing.xs },
  ordered_list: { marginVertical: spacing.xs },
  list_item: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    color: colors.text,
  },
  bullet_list_icon: {
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  bullet_list_content: { flex: 1 },
  ordered_list_icon: {
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  ordered_list_content: { flex: 1 },

  // Tables
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    marginVertical: spacing.sm,
  },
  thead: {},
  tbody: {},
  th: {
    flex: 1,
    padding: spacing.sm,
    fontWeight: 'bold',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
  },
  td: {
    flex: 1,
    padding: spacing.sm,
    color: colors.text,
  },

  // Horizontal rule
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.lg,
  },

  // Images
  image: { flex: 1, borderRadius: 8, marginVertical: spacing.sm },

  // Text
  text: {},
  textgroup: {},
  hardbreak: { width: '100%', height: 1 },
  softbreak: {},
});

// Custom fence rule — adds a language label + per-block copy button
const markdownRules: RenderRules = {
  fence: (node) => {
    let content = node.content;
    if (typeof content === 'string' && content.endsWith('\n')) {
      content = content.slice(0, -1);
    }
    const lang = ((node as unknown as { sourceInfo?: string }).sourceInfo ?? '').trim();

    return (
      <View key={node.key} style={codeBlockStyles.wrapper}>
        <View style={codeBlockStyles.header}>
          <Text style={codeBlockStyles.lang}>{lang || 'code'}</Text>
          <Pressable
            onPress={() => {
              successHaptic();
              Clipboard.setStringAsync(content);
            }}
            hitSlop={8}
            style={codeBlockStyles.copyBtn}
          >
            <HugeiconsIcon icon={Copy01Icon} size={12} color={colors.textSecondary} />
            <Text style={codeBlockStyles.copyLabel}>Copy</Text>
          </Pressable>
        </View>
        <Text style={codeBlockStyles.code}>{content}</Text>
      </View>
    );
  },
};

const codeBlockStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginVertical: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceHover,
  },
  lang: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  code: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: fontSize.md,
    padding: spacing.md,
  },
});

function handleLinkPress(url: string): boolean {
  return true; // let the library open the URL
}

function ChatBubbleInner({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const timeStr = format(new Date(message.createdAt), 'HH:mm');

  const handleCopy = useCallback(() => {
    successHaptic();
    Clipboard.setStringAsync(message.content);
  }, [message.content]);

  if (isUser) {
    return (
      <View style={[styles.container, styles.userContainer]}>
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.agentContainer}>
      <Markdown style={markdownStyles} rules={markdownRules} onLinkPress={handleLinkPress}>
        {message.content || ' '}
      </Markdown>
      {message.streaming && <StreamingCursor />}

      <View style={styles.agentFooter}>
        <Text style={styles.time}>{timeStr}</Text>
        <Pressable onPress={handleCopy} hitSlop={8}>
          <HugeiconsIcon icon={Copy01Icon} size={12} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

export const ChatBubble = memo(ChatBubbleInner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  agentContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: spacing.md,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 16,
  },
  userText: {
    color: '#ffffff',
    fontSize: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  agentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  time: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  timeUser: {
    color: 'rgba(255,255,255,0.6)',
  },
});
