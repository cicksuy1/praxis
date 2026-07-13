## Why recursion needs a floor

Imagine asking a friend "what floor am I on?" and they answer "one above the floor below you" — forever. That's infinite recursion. To escape, someone has to know a ground truth: "you're on floor 1."

The **base case** is that ground truth. It's the condition where the function returns an answer directly, without calling itself again.

```python
def countdown(n):
    if n == 0:          # base case — stop here
        return
    countdown(n - 1)    # recursive step
```

Without `if n == 0`, `countdown` would call itself forever (until Python crashes with a `RecursionError`).

### What makes a good base case?

- It must be **reachable** — the recursive step must move toward it.
- It must be **complete** — it must cover every path that could bottom out.
- Keep it **simple** — the base case should need no recursion to compute its answer.

### The pattern

```
if <simplest possible input>:
    return <known answer>   # base case
return f(<smaller input>)   # recursive step
```

Always write the base case first. It anchors everything else.

## 🧠 Active recall

1. What is the base case in a recursive function, and what happens if it is missing?
2. What two properties must a base case have to guarantee a recursive function terminates?
