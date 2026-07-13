## Thinking recursively

Once you have a base case, the recursive step is the rest of the work. Its job is simple: **make the problem smaller**, then trust the function to handle it.

Consider summing a list:

```python
def total(nums):
    if not nums:            # base case: empty list sums to 0
        return 0
    return nums[0] + total(nums[1:])   # recursive step
```

The recursive step does two things:
1. **Takes a bite** — handles the first element (`nums[0]`).
2. **Delegates the rest** — calls `total` on a shorter list (`nums[1:]`).

Each call makes the list one element shorter, so the base case is eventually reached.

### The leap of faith

The hardest part of writing the recursive step is *trusting it*. Assume your function already works correctly for smaller inputs. Don't trace every level of recursion in your head — just ask:

> If `total` correctly sums any list shorter than this one, what do I need to do with the first element?

Answer: add it to the result of `total(rest)`. That's the step.

### Design checklist

- Does the recursive call receive **strictly smaller** input?
- Does combining `this piece + recursive result` give the **correct full answer**?
- Is every meaningful smaller input covered by either the step or the base case?

## 🧠 Active recall

1. What are the two responsibilities of a recursive step?
2. What is the 'leap of faith' technique, and why does it help when writing recursive functions?
