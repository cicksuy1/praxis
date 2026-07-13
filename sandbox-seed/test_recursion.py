import unittest

from recursion import countdown, sum_to


class TestBaseCase(unittest.TestCase):
    def test_countdown_reaches_zero(self):
        self.assertEqual(countdown(3), [3, 2, 1, 0])

    def test_countdown_base_case_only(self):
        self.assertEqual(countdown(0), [0])


class TestRecursiveStep(unittest.TestCase):
    def test_sum_small(self):
        self.assertEqual(sum_to(4), 10)

    def test_sum_zero(self):
        self.assertEqual(sum_to(0), 0)


if __name__ == "__main__":
    unittest.main()
