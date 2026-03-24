# Day 4: Why a GIN Index on a BIGINT[] is Correct

In our Day 1 migration, we added a GIN index to the `affected_hex_ids` (a `BIGINT[]` array) column on the `disruption_events` table. This choice is deliberate and crucial for a specific type of query that we'll need.

```sql
CREATE INDEX idx_disruption_events_affected_hex_ids ON disruption_events USING GIN (affected_hex_ids);
```

Let's break down why this is the right tool for the job.

### 1. Why GIN vs. GiST or B-Tree?

PostgreSQL offers several index types, and the right choice depends entirely on the **data type** you are indexing and the **operators** you will use in your `WHERE` clauses.

*   **B-Tree:** This is the default index and the one most developers are familiar with. It's perfect for scalar values and range queries (e.g., `_`, `_`, `=`, `IN`). However, a B-Tree indexes the *entire array as a single item*. It can tell you if `affected_hex_ids` is *exactly equal to* `'{1, 2, 3}'`. It is completely useless for finding out if the array *contains* the number `2`.

*   **GiST (Generalized Search Tree):** GiST is a more versatile index that can handle complex data types like geometric data and full-text search. It can be used to index arrays and can answer questions like "do these two arrays overlap?" (`&&` operator). While it *can* work for our use case, it's generally considered less efficient for simple array "contains" operations compared to GIN.

*   **GIN (Generalized Inverted Index):** GIN is the specialist for this exact scenario. It was designed to handle "composite" types where you need to look *inside* the value. A GIN index on an array doesn't create one entry for the array; it creates **one index entry for each unique value inside the array**, mapping that value back to the rows that contain it.

Our most common lookup scenario for this column will be:

> "For a given worker's `home_hex_id`, find all the disruption events that affected them."

This translates to the following SQL query:

```sql
SELECT * FROM disruption_events WHERE affected_hex_ids @> ARRAY[YOUR_WORKERS_HEX_ID];
```
*(The `@>` operator means "contains")*

The GIN index can answer this question almost instantly. It will look up `YOUR_WORKERS_HEX_ID` in its inverted index and immediately get a list of all the rows that contain that ID. A B-Tree could not do this at all, and a GiST would be slower.

### 2. Expected Query Performance Improvement

Without an index, the query above would require a **Sequential Scan** on the `disruption_events` table. The database would have to load every single row, inspect the `affected_hex_ids` array for each one, and see if it contains the worker's hex ID. For a table with millions of events, this could take **seconds or even minutes**.

With the GIN index, the database performs an **Index Scan**. It uses the index to find the matching rows in logarithmic time, and then fetches only those specific rows from the table. The performance difference is staggering: the query time will drop to a few **milliseconds**, even with a very large table.

### 3. How to Verify the Index is Being Used

You don't have to take our word for it! PostgreSQL provides a powerful tool, `EXPLAIN ANALYZE`, that shows you the exact query plan the database will execute.

To verify your index is active, run this command in `psql` or your favorite SQL client:

```sql
EXPLAIN ANALYZE
SELECT * FROM disruption_events WHERE affected_hex_ids @> ARRAY[some_real_hex_id_from_your_db];
```

**Query Plan WITHOUT the GIN Index:**
```
                                          QUERY PLAN
-----------------------------------------------------------------------------------------------
 Seq Scan on disruption_events  (cost=0.00..43.50 rows=10 width=125) (actual time=0.015..0.016 rows=1 loops=1)
   Filter: (affected_hex_ids @> '{85283473fffffff}')
 Planning time: 0.084 ms
 Execution time: 0.040 ms
```
The key phrase here is **`Seq Scan`** (Sequential Scan).

**Query Plan WITH the GIN Index:**
```
                                                QUERY PLAN
-----------------------------------------------------------------------------------------------------------
 Bitmap Heap Scan on disruption_events  (cost=4.38..15.32 rows=10 width=125) (actual time=0.021..0.022 rows=1 loops=1)
   Recheck Cond: (affected_hex_ids @> '{85283473fffffff}')
   ->  Bitmap Index Scan on idx_disruption_events_affected_hex_ids  (cost=0.00..4.38 rows=10 width=0) (actual time=0.016..0.016 rows=1 loops=1)
         Index Cond: (affected_hex_ids @> '{85283473fffffff}')
 Planning time: 0.117 ms
 Execution time: 0.053 ms
```
The key phrases here are **`Bitmap Index Scan`** or **`Index Scan`** on your named index (`idx_disruption_events_affected_hex_ids`). This proves the database is using your GIN index to rapidly find the correct rows.
