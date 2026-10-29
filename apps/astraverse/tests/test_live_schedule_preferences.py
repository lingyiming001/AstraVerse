from datetime import datetime, timezone
from astraverse.modules.live.routine import DailyRoutine, RoutineSlot, phase, routine_context
from astraverse.modules.live.program import LiveProgram
from astraverse.modules.live.awareness import session_program


def test_afternoon_preferences_and_solo_preserve_plan():
    routine = DailyRoutine(enabled=True, slots=[RoutineSlot(start='00:00', title='自由'), RoutineSlot(start='13:00', title='放松', interaction='low', music='prefer', mood='relaxed')])
    current = phase(routine, datetime(2026, 10, 29, 6, tzinfo=timezone.utc))
    assert (current['interaction'], current['music'], current['mood']) == ('low', 'prefer', 'relaxed')
    effective = session_program(LiveProgram(daily=routine), {'interval':10})
    assert effective.daily.enabled and effective.daily.slots[1].music == 'prefer'


def test_old_slots_default_and_no_plan_freedom():
    slot = RoutineSlot(start='00:00', title='旧配置')
    assert slot.interaction == 'balanced' and slot.mood == 'natural'
    assert '自由发挥' in routine_context(DailyRoutine())
