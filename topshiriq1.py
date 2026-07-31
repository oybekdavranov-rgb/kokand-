# 1-topshiriq — Dasturlash asoslari
# Ishga tushirish:  python topshiriq1.py

import math


def son(nom, standart):
    """Foydalanuvchidan son so'raydi. Enter bosilsa — standart qiymat."""
    javob = input(f"{nom} = [{standart}] ").strip()
    return float(javob) if javob else standart


def yoz(nom, v):
    if isinstance(v, float) and math.isfinite(v):
        print(f"{nom} = {v:.6f}\n")
    else:
        print("Xato: nolga bo'linish yoki noaniqlik\n")


# 1-2: ko'p qavatli kasrni ichkaridan boshlab hisoblaymiz
def masala1():
    print("--- 1-2-masala ---")
    a = son("a", 12.3)
    b = son("b", 53.24)
    al = son("alfa", 0.1543)

    m1 = a ** 3 + b - (3 * a + b) / (7 * a * b)
    m2 = a * a + b * b - (1.25 * a - b) / m1
    y = ((3.75 * a - b) / m2
         + (math.sin(al) + a) / (math.cos(al) + b)
         - abs(2 * a - b) ** 0.25 / math.log(abs(a - b))
         * math.exp(2 * math.pi / (3 * b)))
    yoz("y", y)


def masala3():
    print("--- 3-masala ---")
    x = son("x", 0.0374)
    y = son("y", -0.825)
    z = son("z", 16.0)

    v = ((1 + math.sin(x + y) ** 2) / abs(x - 2 * y / (1 + x * x * y * y))
         * x ** abs(y)
         + math.cos(math.atan(1 / z)) ** 2)
    yoz("v", v)


def masala4():
    print("--- 4-masala ---")
    x = son("x", 3.74)
    y = son("y", 5.0)
    z = son("z", 0.16)

    v = (1 + math.sin(x + y)) / abs(y / 2) * math.cos(math.atan(1 / z))
    yoz("v", v)


def masala5():
    print("--- 5-masala ---")
    a = son("a", 1.3)
    b = son("b", 4.0)

    m = a * a + b * b - (a - b) / (a ** 3 + (a + b) / 7)
    yoz("y", (a - b) / m)


for masala in (masala1, masala3, masala4, masala5):
    try:
        masala()
    except (ZeroDivisionError, ValueError, OverflowError) as xato:
        print(f"Xato: {xato}\n")
