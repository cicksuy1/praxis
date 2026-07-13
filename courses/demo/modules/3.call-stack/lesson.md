## How the computer tracks recursion

When a function calls itself, the computer doesn't forget where it was. It pushes a **stack frame** — a record of the current call's local variables and its place in the code — onto the **call stack**. The new call runs on top. When it finishes, its frame is popped off and the previous call resumes.

```
countdown(3)
  └─ countdown(2)
       └─ countdown(1)
            └─ countdown(0)   ← base case, returns
         ← resumes, returns
    ← resumes, returns
← resumes, returns
```

The stack grows **down** with each call and shrinks **up** as each returns.

### Why this matters

**Stack overflow:** Python (and most runtimes) cap the stack depth — typically ~1000 frames. A missing base case, or a very deep recursion, exceeds the cap and crashes with `RecursionError: maximum recursion depth exceeded`.

**Memory cost:** Every frame consumes memory. A recursive solution over a million-element list is impractical; an iterative loop or tail-call optimization is needed instead.

**Debugging:** When a recursive function misbehaves, reading the stack trace bottom-up tells you the chain of calls that led to the error.

### Mental model

Think of the call stack as a stack of sticky notes. Each new recursive call sticks a new note on top. The base case finishes its note and hands its answer to the note below it, which peels off. When all notes are peeled, the original caller has the final answer.

## 🧠 Active recall

1. What is a stack frame, and when is one created during recursion?
2. What causes a stack overflow in a recursive function, and how can you avoid it?
3. If you see 'RecursionError: maximum recursion depth exceeded', what are the two most likely causes?
