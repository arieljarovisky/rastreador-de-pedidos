import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Order } from '../types';
import { colors, fonts, radius, spacing } from '../theme';
import PostaIcon from './icons/PostaIcons';
import {
  computeDeliverySummaryFromOrders,
  formatMinutesUntilDeadline,
  DELIVERY_DEADLINE_HOUR,
} from '../utils/deliverySummary';

interface Props {
  orders: Order[];
}

export default function DeliverySummaryCard({ orders }: Props) {
  const summary = useMemo(() => computeDeliverySummaryFromOrders(orders), [orders]);

  const urgency =
    summary.isPastDeadline && summary.undelivered > 0
      ? 'overdue'
      : summary.undelivered > 0 && summary.minutesUntilDeadline <= 120
        ? 'warning'
        : 'ok';

  const borderColor =
    urgency === 'overdue' ? colors.red : urgency === 'warning' ? colors.amber : colors.border;
  const bgColor =
    urgency === 'overdue'
      ? `${colors.red}14`
      : urgency === 'warning'
        ? `${colors.amber}14`
        : colors.surfaceAlt;

  const progressPct =
    summary.total > 0 ? Math.round((summary.delivered / summary.total) * 100) : 0;

  return (
    <View style={[styles.card, { borderColor, backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <PostaIcon name="live" size={14} color={urgency === 'overdue' ? colors.red : colors.accent} />
          <Text style={styles.title}>Control del día</Text>
        </View>
        <Text style={[styles.deadline, urgency === 'overdue' && styles.deadlineOverdue]}>
          {summary.isPastDeadline
            ? 'Corte vencido'
            : `${formatMinutesUntilDeadline(summary.minutesUntilDeadline)} · ${DELIVERY_DEADLINE_HOUR}:00`}
        </Text>
      </View>

      <View style={styles.stats}>
        <View style={[styles.stat, styles.statOk]}>
          <Text style={styles.statLabel}>Entregados</Text>
          <Text style={[styles.statValue, { color: colors.green }]}>{summary.delivered}</Text>
        </View>
        <View style={[styles.stat, summary.undelivered > 0 && styles.statWarn]}>
          <Text style={styles.statLabel}>Sin entregar</Text>
          <Text
            style={[
              styles.statValue,
              { color: summary.undelivered > 0 ? colors.amber : colors.text },
            ]}
          >
            {summary.undelivered}
          </Text>
        </View>
        <View style={[styles.stat, summary.overdue > 0 && styles.statDanger]}>
          <Text style={styles.statLabel}>Fuera plazo</Text>
          <Text
            style={[
              styles.statValue,
              { color: summary.overdue > 0 ? colors.red : colors.text },
            ]}
          >
            {summary.overdue}
          </Text>
        </View>
      </View>

      {summary.total > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{progressPct}% del día</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.text,
  },
  deadline: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
  },
  deadlineOverdue: {
    color: colors.red,
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statOk: {
    borderColor: `${colors.green}44`,
  },
  statWarn: {
    borderColor: `${colors.amber}44`,
    backgroundColor: `${colors.amber}0A`,
  },
  statDanger: {
    borderColor: `${colors.red}44`,
    backgroundColor: `${colors.red}0A`,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
  },
  progressWrap: {
    gap: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.green,
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'right',
  },
});
