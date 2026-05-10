import { integer, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    name: text('name').notNull(),
    userName: text('user_name').notNull().unique(),
    password: text('password').notNull(),
    level: text('level').notNull(),
});

export const customers = pgTable('customers', {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    phone: text('phone'),
    description: text('description'),
    remark: text('remark'),
    photo: text('photo'),
    faceDescriptor: text('face_descriptor'),
});

export const items = pgTable('items', {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    status: text('status').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    photo: text('photo'),
    grossWeight: real('gross_weight'),
    netWeight: real('net_weight'),
    jewelleryType: text('jewellery_type'),
    dailySerial: integer('daily_serial'),
    storeIndex: text('store_index'),
    number: integer('number'),
    itemOtherType: text('item_other_type'),
});

export const pawns = pgTable('pawns', {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    interestRate: real('interest_rate'),
    maxAvailableAmount: integer('max_available_amount'),
    description: text('description'),
    note: text('note'),
    customerFk: integer('customer_fk').references(() => customers.id).notNull(),
    itemFk: integer('item_fk').references(() => items.id),
    physicalNumber: text('physical_number'),
    storageLocation: text('storage_location'),
    boxNumber: integer('box_number'),
    trayNumber: integer('tray_number'),
    dayOfMonth: integer('day_of_month'),
    sequence: integer('sequence'),
    slotNumber: integer('slot_number'),
    lastPaymentDate: timestamp('last_payment_date', { withTimezone: false }),
});

export const cashTransactions = pgTable('cash_transactions', {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    date: timestamp('date', { withTimezone: false }).defaultNow(),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    discount: integer('discount').default(0),
    description: text('description'),
    pawnFk: integer('pawn_fk').references(() => pawns.id).notNull(),
    employeeFk: integer('employee_fk').references(() => employees.id),
});

export const settings = pgTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});
